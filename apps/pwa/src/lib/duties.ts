import { supabase } from './supabase';
import { earliestVisibleDay, todayISO } from './dates';
import {
  db,
  flushOutboxWith,
  OUTBOX_SYNC_TAG,
  overlayPendingOutbox,
  recomputeLocalDutyStatus,
  setLastSyncedAt,
  type CachedDuty,
  type CachedStep,
  type StepPatcher,
} from './offline';

function dateWindow() {
  // Exactly the range the day rail can display — HISTORY_DAYS back through today, nothing
  // ahead. Syncing narrower than the UI shows makes real duties render as "no duties"; syncing
  // wider would cache upcoming duties the employee is deliberately not allowed to see.
  // Local calendar dates, matching due_date (a plain DATE): toISOString() would resolve to the
  // UTC day and disagree by one east of Greenwich.
  return { from: earliestVisibleDay(), to: todayISO() };
}

/** Pulls this employee's nearby duties + steps from Supabase and refreshes the local cache. */
export async function refreshDutiesFromServer(
  employeeId: string,
): Promise<{ error: string | null }> {
  // Only the OS's "definitely offline" skips the attempt. A request that timed out on lie-fi
  // must not stop the next one — a real request is the only thing that can prove we're back.
  if (!navigator.onLine) return { error: null };

  const { from, to } = dateWindow();
  const { data, error } = await supabase
    .from('duties')
    .select(
      'id, employee_id, category, due_date, scope_surah_from, scope_ayah_from, scope_surah_to, scope_ayah_to, scope_note, status, duty_step_progress(id, duty_id, step_order, step_key, is_completed, completed_at)',
    )
    .eq('employee_id', employeeId)
    .gte('due_date', from)
    .lte('due_date', to)
    .order('due_date');

  if (error) return { error: 'تعذر تحديث البيانات' };

  const duties: CachedDuty[] = [];
  const steps: CachedStep[] = [];

  for (const row of data ?? []) {
    duties.push({
      id: row.id,
      employeeId: row.employee_id,
      category: row.category,
      dueDate: row.due_date,
      scopeSurahFrom: row.scope_surah_from,
      scopeAyahFrom: row.scope_ayah_from,
      scopeSurahTo: row.scope_surah_to,
      scopeAyahTo: row.scope_ayah_to,
      scopeNote: row.scope_note,
      status: row.status,
    });
    for (const s of row.duty_step_progress ?? []) {
      steps.push({
        id: s.id,
        dutyId: s.duty_id,
        stepOrder: s.step_order,
        stepKey: s.step_key,
        isCompleted: s.is_completed,
        completedAt: s.completed_at,
      });
    }
  }

  await db.transaction('rw', db.duties, db.steps, async () => {
    // Drop this employee's cached steps along with their duties. Editing an assignment makes
    // propagate_group_assignment_update() delete and re-insert duty_step_progress rows with
    // fresh ids, so a bulkPut alone would leave the superseded rows behind and the checklist
    // would render twice.
    const staleDutyIds = await db.duties.where('employeeId').equals(employeeId).primaryKeys();
    await db.steps.where('dutyId').anyOf(staleDutyIds).delete();
    await db.duties.where('employeeId').equals(employeeId).delete();
    await db.steps.bulkPut(steps);
    await db.duties.bulkPut(duties);
  });

  // Ticks that could not be flushed yet must stay ticked on screen.
  await overlayPendingOutbox();

  // Stamped only on a completed sync, so the freshness the UI reports is the truth: a failed
  // or skipped refresh leaves the previous timestamp standing.
  await setLastSyncedAt();

  return { error: null };
}

export async function getCachedDuties(employeeId: string) {
  const duties = await db.duties.where('employeeId').equals(employeeId).sortBy('dueDate');
  const steps = await db.steps
    .where('dutyId')
    .anyOf(duties.map((d) => d.id))
    .toArray();
  const stepsByDuty = new Map<string, CachedStep[]>();
  for (const s of steps) {
    const list = stepsByDuty.get(s.dutyId) ?? [];
    list.push(s);
    stepsByDuty.set(s.dutyId, list);
  }
  return duties.map((d) => ({
    ...d,
    steps: (stepsByDuty.get(d.id) ?? []).sort((a, b) => a.stepOrder - b.stepOrder),
  }));
}

/** Optimistically toggles a step locally, queues the write, and tries to sync immediately. */
export async function toggleStep(stepId: string, isCompleted: boolean) {
  const completedAt = isCompleted ? new Date().toISOString() : null;
  const step = await db.steps.get(stepId);
  await db.steps.update(stepId, { isCompleted, completedAt });

  // One queued write per step, latest wins: ticking and unticking five times offline should
  // replay as one update, not five.
  await db.transaction('rw', db.outbox, async () => {
    await db.outbox.where('stepId').equals(stepId).delete();
    await db.outbox.add({
      createdAt: Date.now(),
      stepId,
      isCompleted,
      completedAt,
      dutyId: step?.dutyId,
      stepKey: step?.stepKey,
    });
  });

  if (step) await recomputeLocalDutyStatus(step.dutyId);
  await requestBackgroundSync();
  await flushOutbox();
}

/**
 * Asks the service worker to flush the outbox when the connection returns, even if the app
 * has been closed by then. Android/Chromium only; elsewhere the app flushes on open.
 */
async function requestBackgroundSync() {
  try {
    const registration = await navigator.serviceWorker?.ready;
    const sync = (
      registration as ServiceWorkerRegistration & {
        sync?: { register(tag: string): Promise<void> };
      }
    )?.sync;
    await sync?.register(OUTBOX_SYNC_TAG);
  } catch {
    // Unsupported or denied — the in-app triggers still cover it.
  }
}

const supabasePatcher: StepPatcher = async (match, values) => {
  let query = supabase
    .from('duty_step_progress')
    .update({ is_completed: values.isCompleted, completed_at: values.completedAt });
  query =
    'id' in match
      ? query.eq('id', match.id)
      : query.eq('duty_id', match.dutyId).eq('step_key', match.stepKey);
  const { data, error } = await query.select('id');
  if (error) return null;
  if (data.length === 0) {
    // Zero rows can also mean the session lapsed and RLS hid the row. Only a live session
    // makes "zero rows" mean "the step is gone".
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return null;
  }
  return data.length;
};

/** Replays queued step updates to Supabase. Never throws. */
export async function flushOutbox(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    await flushOutboxWith(supabasePatcher);
  } catch {
    // Best-effort: the entries stay queued and the next sync retries them.
  }
}

export async function pendingOutboxCount(): Promise<number> {
  return db.outbox.count();
}

let inFlight: Promise<void> | null = null;

/**
 * Flush queued ticks, then pull the server's view. Single-flight: mount, `online`, returning to
 * the foreground, realtime events and pushes all ask for a sync, often at the same moment, and
 * overlapping flushes would replay the same outbox entry twice.
 */
export function syncNow(employeeId: string): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await flushOutbox();
      await refreshDutiesFromServer(employeeId);
    } catch {
      // The cache stays as it was; the next trigger retries.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
