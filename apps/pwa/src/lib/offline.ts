import Dexie, { type EntityTable } from 'dexie';
import type { DutyCategory, DutyStatus } from '@wird/domain';

export interface CachedDuty {
  id: string;
  employeeId: string;
  category: DutyCategory;
  dueDate: string;
  scopeSurahFrom: number;
  scopeAyahFrom: number;
  scopeSurahTo: number;
  scopeAyahTo: number;
  scopeNote: string | null;
  status: DutyStatus;
}

export interface CachedStep {
  id: string;
  dutyId: string;
  stepOrder: number;
  stepKey: string;
  isCompleted: boolean;
  completedAt: string | null;
}

export interface OutboxEntry {
  id?: number;
  createdAt: number;
  stepId: string;
  isCompleted: boolean;
  completedAt: string | null;
  // Where the step lives, so a write can still land after the supervisor edits the assignment:
  // propagate_group_assignment_update() re-seeds steps with new ids, and an update by the old
  // id then matches nothing. Optional because entries queued before this field existed lack it.
  dutyId?: string;
  stepKey?: string;
}

/** Supervisor reminder cards, cached so the header is not blank on a cold offline open. */
export interface CachedBanner {
  id: string;
  body: string;
  source: string | null;
  sortOrder: number;
  createdAt: string;
}

/**
 * Small key/value store. `lastSyncedAt` lets the UI tell "you are looking at fresh data" from
 * "you are looking at whatever was cached a week ago". The others: the signed-in profile (so a
 * cold offline open is not bounced to login), this device's push id, the access token mirrored
 * for the service worker, the last leaderboard, and recently shown push ids.
 */
export interface MetaEntry {
  key: string;
  value: string;
}

const db = new Dexie('wird-offline') as Dexie & {
  duties: EntityTable<CachedDuty, 'id'>;
  steps: EntityTable<CachedStep, 'id'>;
  outbox: EntityTable<OutboxEntry, 'id'>;
  banners: EntityTable<CachedBanner, 'id'>;
  meta: EntityTable<MetaEntry, 'key'>;
};

db.version(1).stores({
  duties: 'id, employeeId, dueDate',
  steps: 'id, dutyId',
  outbox: '++id, stepId',
});

// v2 adds the banner cache and the sync-bookkeeping store. Dexie carries v1 data forward
// untouched, so an existing install keeps its queued outbox across the upgrade.
db.version(2).stores({
  duties: 'id, employeeId, dueDate',
  steps: 'id, dutyId',
  outbox: '++id, stepId',
  banners: 'id, sortOrder',
  meta: 'key',
});

export { db };

// Everything in this file must stay free of DOM-only APIs: the service worker (src/sw.ts)
// imports it to write push payloads into the same cache the app reads.

const LAST_SYNCED = 'lastSyncedAt';

export async function setLastSyncedAt(at: number = Date.now()): Promise<void> {
  await db.meta.put({ key: LAST_SYNCED, value: String(at) });
}

export async function getLastSyncedAt(): Promise<number | null> {
  const row = await db.meta.get(LAST_SYNCED);
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

// ─── Generic JSON values in meta ──────────────────────────────────────────────

export async function getMetaJSON<T>(key: string): Promise<T | null> {
  try {
    const row = await db.meta.get(key);
    return row ? (JSON.parse(row.value) as T) : null;
  } catch {
    return null;
  }
}

export async function setMetaJSON(key: string, value: unknown): Promise<void> {
  try {
    await db.meta.put({ key, value: JSON.stringify(value) });
  } catch {
    // Best-effort cache: a failed write must never break the caller.
  }
}

export async function deleteMeta(key: string): Promise<void> {
  try {
    await db.meta.delete(key);
  } catch {
    /* ignore */
  }
}

// ─── Device id (push) ─────────────────────────────────────────────────────────

const DEVICE_ID = 'deviceId';

/**
 * A stable id for this browser profile, sent with the push token so the server keeps exactly
 * one token per device (register_push_token). On Android the browser and the installed app
 * share storage, so they share this id and therefore one token — no double notifications.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await db.meta.get(DEVICE_ID);
  if (existing) return existing.value;
  const id = crypto.randomUUID();
  await db.meta.put({ key: DEVICE_ID, value: id });
  return id;
}

// ─── Access token mirror (for the service worker) ─────────────────────────────

const ACCESS_TOKEN = 'accessToken';

export interface MirroredToken {
  token: string;
  /** Epoch ms. */
  expiresAt: number;
}

/**
 * The service worker cannot read localStorage, where supabase-js keeps the session, so the app
 * mirrors the current access token here. The worker only ever *uses* it (Background Sync of
 * queued ticks) while it is unexpired — refreshing is left to the app, since two refreshers
 * racing on one refresh token would sign the user out.
 */
export async function mirrorAccessToken(value: MirroredToken | null): Promise<void> {
  if (value) await setMetaJSON(ACCESS_TOKEN, value);
  else await deleteMeta(ACCESS_TOKEN);
}

export async function getMirroredAccessToken(): Promise<string | null> {
  const value = await getMetaJSON<MirroredToken>(ACCESS_TOKEN);
  // A minute of margin: a token that expires mid-request is no better than an expired one.
  if (!value || value.expiresAt - 60_000 < Date.now()) return null;
  return value.token;
}

// ─── Local duty status ────────────────────────────────────────────────────────

// Mirrors the server-side sync_duty_status() trigger, so the UI's status badge updates
// instantly offline instead of waiting for the next server refresh.
export async function recomputeLocalDutyStatus(dutyId: string): Promise<void> {
  const steps = await db.steps.where('dutyId').equals(dutyId).toArray();
  const completed = steps.filter((s) => s.isCompleted).length;
  const status: DutyStatus =
    completed === 0 ? 'pending' : completed === steps.length ? 'completed' : 'in_progress';
  await db.duties.update(dutyId, { status });
}

/**
 * Re-applies ticks still waiting in the outbox on top of whatever was just written from the
 * server (a refresh or a push snapshot). Without this, a sync that lands while the outbox is
 * non-empty shows the server's older state and the employee's offline ticks visibly un-tick,
 * even though they are still queued and will reach the server.
 */
export async function overlayPendingOutbox(): Promise<void> {
  const entries = await db.outbox.toCollection().sortBy('createdAt');
  if (entries.length === 0) return;

  const touched = new Set<string>();
  await db.transaction('rw', db.steps, async () => {
    for (const entry of entries) {
      let step = await db.steps.get(entry.stepId);
      // The step may have been re-seeded under a new id; fall back to its place in the duty.
      if (!step && entry.dutyId && entry.stepKey) {
        step = await db.steps
          .where('dutyId')
          .equals(entry.dutyId)
          .filter((s) => s.stepKey === entry.stepKey)
          .first();
      }
      if (!step) continue;
      await db.steps.update(step.id, {
        isCompleted: entry.isCompleted,
        completedAt: entry.completedAt,
      });
      touched.add(step.dutyId);
    }
  });
  for (const dutyId of touched) await recomputeLocalDutyStatus(dutyId);
}

// ─── Push snapshot → cache ────────────────────────────────────────────────────

/**
 * One duty as carried in a push payload (push_targets() in SQL). Keys are one letter because
 * web push payloads are capped at 4 KB.
 */
export interface SnapshotDuty {
  i: string;
  c: DutyCategory;
  s: [number, number, number, number];
  n: string | null;
  t: DutyStatus;
  x: [string, string, number, boolean][];
}

/**
 * Writes a pushed snapshot of one employee's day into the cache. The snapshot is the server's
 * complete view of that day, so duties for the day that are missing from it (an assignment
 * the supervisor deleted) are removed too. Pending offline ticks are re-applied afterwards.
 */
export async function applyDutySnapshot(
  employeeId: string,
  day: string,
  snapshot: SnapshotDuty[],
): Promise<void> {
  const duties: CachedDuty[] = snapshot.map((d) => ({
    id: d.i,
    employeeId,
    category: d.c,
    dueDate: day,
    scopeSurahFrom: d.s[0],
    scopeAyahFrom: d.s[1],
    scopeSurahTo: d.s[2],
    scopeAyahTo: d.s[3],
    scopeNote: d.n,
    status: d.t,
  }));
  const steps: CachedStep[] = snapshot.flatMap((d) =>
    d.x.map(([id, stepKey, stepOrder, isCompleted]) => ({
      id,
      dutyId: d.i,
      stepOrder,
      stepKey,
      isCompleted,
      completedAt: null,
    })),
  );

  await db.transaction('rw', db.duties, db.steps, async () => {
    const staleIds = await db.duties
      .where('dueDate')
      .equals(day)
      .filter((d) => d.employeeId === employeeId)
      .primaryKeys();
    // Keep completedAt of steps we already knew, the snapshot does not carry it.
    const known = new Map(
      (await db.steps.where('dutyId').anyOf(staleIds).toArray()).map((s) => [s.id, s]),
    );
    for (const s of steps) s.completedAt = known.get(s.id)?.completedAt ?? null;

    await db.steps.where('dutyId').anyOf(staleIds).delete();
    await db.duties.bulkDelete(staleIds);
    await db.steps.bulkPut(steps);
    await db.duties.bulkPut(duties);
  });

  await overlayPendingOutbox();
}

// ─── Outbox flush (shared by the app and the service worker) ──────────────────

/** Background Sync tag: the service worker flushes the outbox when connectivity returns. */
export const OUTBOX_SYNC_TAG = 'wird-outbox';

/**
 * Applies one step update on the server. Returns the number of rows it matched, or null when
 * the request itself failed (offline, timeout, auth error). The app implements it with
 * supabase-js, the service worker with plain fetch.
 */
export type StepPatcher = (
  match: { id: string } | { dutyId: string; stepKey: string },
  values: { isCompleted: boolean; completedAt: string | null },
) => Promise<number | null>;

/**
 * Replays queued step updates in order; stops at the first failure.
 *
 * "No error" is not success: an update that matches zero rows (expired session under RLS, or
 * a step re-seeded with a new id) returns no error at all, and treating that as done silently
 * threw the employee's tick away. An entry is only dropped when a row was actually updated, or
 * when the step is provably gone (zero rows by id *and* by its place in the duty) under a
 * working session. Never throws.
 */
export async function flushOutboxWith(patch: StepPatcher): Promise<void> {
  const entries = await db.outbox.toCollection().sortBy('createdAt');

  for (const entry of entries) {
    const values = { isCompleted: entry.isCompleted, completedAt: entry.completedAt };
    let rows = await patch({ id: entry.stepId }, values);
    if (rows === null) return; // network/auth failure — keep everything queued

    if (rows === 0 && entry.dutyId && entry.stepKey) {
      rows = await patch({ dutyId: entry.dutyId, stepKey: entry.stepKey }, values);
      if (rows === null) return;
    }

    // rows === 0 here means the step no longer exists (its duty was deleted); the patcher
    // only reports 0 with a valid session, so dropping the entry loses nothing real.
    if (entry.id !== undefined) await db.outbox.delete(entry.id);
  }
}
