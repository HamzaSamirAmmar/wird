/** Local-calendar ISO date helpers. Duty due-dates are plain `YYYY-MM-DD`, never instants. */

/**
 * How far back an employee may look. Today is the newest day they can ever select — upcoming
 * duties are deliberately not shown, so nobody works ahead of the supervisor's plan.
 *
 * This is the single source of truth for the visible range: the day rail draws exactly this
 * many days and `lib/duties.ts` syncs exactly this window. Letting them drift apart is what
 * makes real duties render as "no duties for this day", so both import this constant rather
 * than each carrying its own number.
 */
export const HISTORY_DAYS = 30;

/** Today in the browser's own timezone (toISOString would shift it to UTC). */
export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

const longDay = new Intl.DateTimeFormat('ar', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function formatDayLabel(iso: string) {
  return longDay.format(new Date(`${iso}T00:00:00`));
}

/** "اليوم" / "أمس" when close, otherwise the full weekday label. */
export function formatRelativeDay(iso: string) {
  const today = todayISO();
  if (iso === today) return 'اليوم';
  if (iso === addDays(today, -1)) return 'أمس';
  // No "غداً": tomorrow is never selectable, so the branch would be dead.
  return formatDayLabel(iso);
}

/** Oldest selectable day. */
export function earliestVisibleDay() {
  return addDays(todayISO(), -HISTORY_DAYS);
}

/** Clamps any date into [earliestVisibleDay, today]. */
export function clampToVisibleRange(iso: string) {
  const today = todayISO();
  if (iso > today) return today;
  const earliest = earliestVisibleDay();
  return iso < earliest ? earliest : iso;
}
