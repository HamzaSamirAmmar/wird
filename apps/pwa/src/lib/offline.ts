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
 * Small key/value store for sync bookkeeping. `lastSyncedAt` is the only key so far: without
 * it the UI cannot tell "you are looking at fresh data" from "you are looking at whatever was
 * cached a week ago", which is the difference between trusting the checklist and not.
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

const LAST_SYNCED = 'lastSyncedAt';

export async function setLastSyncedAt(at: number = Date.now()): Promise<void> {
  await db.meta.put({ key: LAST_SYNCED, value: String(at) });
}

export async function getLastSyncedAt(): Promise<number | null> {
  const row = await db.meta.get(LAST_SYNCED);
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
