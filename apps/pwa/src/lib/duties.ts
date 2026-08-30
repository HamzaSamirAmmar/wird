import { supabase } from './supabase';
import { addDays, todayISO } from './dates';
import { db, type CachedDuty, type CachedStep } from './offline';

// The day rail on MyDuties shows the whole Saturday-first week containing the selected day,
// so when today is late in the week the rail reaches six days back. Syncing a narrower window
// than the UI can display makes real duties render as "no duties for this day".
const WINDOW_DAYS_BEFORE = 7;
const WINDOW_DAYS_AFTER = 7;

function dateWindow() {
  // Local calendar dates, matching due_date (a plain DATE) and the UI's own day maths.
  // toISOString() would resolve to the UTC day and disagree by one east of Greenwich.
  const today = todayISO();
  return { from: addDays(today, -WINDOW_DAYS_BEFORE), to: addDays(today, WINDOW_DAYS_AFTER) };
}

/** Pulls this employee's nearby duties + steps from Supabase and refreshes the local cache. */
export async function refreshDutiesFromServer(
  employeeId: string,
): Promise<{ error: string | null }> {
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
  await db.outbox.add({ createdAt: Date.now(), stepId, isCompleted, completedAt });

  if (step) await recomputeLocalDutyStatus(step.dutyId);
  await flushOutbox();
}

// Mirrors the server-side sync_duty_status() trigger, so the UI's status badge updates
// instantly offline instead of waiting for the next server refresh.
async function recomputeLocalDutyStatus(dutyId: string) {
  const steps = await db.steps.where('dutyId').equals(dutyId).toArray();
  const completed = steps.filter((s) => s.isCompleted).length;
  const status =
    completed === 0 ? 'pending' : completed === steps.length ? 'completed' : 'in_progress';
  await db.duties.update(dutyId, { status });
}

/**
 * Replays queued step updates to Supabase in order; stops at the first failure.
 *
 * Never throws. This runs ahead of the duty fetch on every refresh, so letting it reject
 * would abort the sync entirely — which is exactly what a missing index here used to do.
 */
export async function flushOutbox(): Promise<void> {
  if (!navigator.onLine) return;

  try {
    // sortBy (in memory), not orderBy: `createdAt` is not an index on the outbox store, and
    // orderBy on an unindexed keyPath throws SchemaError. The outbox only ever holds writes
    // that have not reached the server yet, so sorting it in memory costs nothing.
    const entries = await db.outbox.toCollection().sortBy('createdAt');

    for (const entry of entries) {
      const { error } = await supabase
        .from('duty_step_progress')
        .update({ is_completed: entry.isCompleted, completed_at: entry.completedAt })
        .eq('id', entry.stepId);

      if (error) return; // keep remaining entries queued, try again next time

      if (entry.id !== undefined) await db.outbox.delete(entry.id);
    }
  } catch {
    // Best-effort: the entries stay queued and the next refresh retries them.
  }
}

export async function pendingOutboxCount(): Promise<number> {
  return db.outbox.count();
}
