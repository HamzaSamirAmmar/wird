/** Local-calendar ISO date helpers. Duty due-dates are plain `YYYY-MM-DD`, never instants. */

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

/** Saturday-first week, matching the working week in the region. */
export function isoWeekStart(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return addDays(iso, -((d.getDay() + 1) % 7));
}

const longDay = new Intl.DateTimeFormat('ar', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function formatDayLabel(iso: string) {
  return longDay.format(new Date(`${iso}T00:00:00`));
}

/** "اليوم" / "أمس" / "غداً" when close, otherwise the full weekday label. */
export function formatRelativeDay(iso: string) {
  const today = todayISO();
  if (iso === today) return 'اليوم';
  if (iso === addDays(today, -1)) return 'أمس';
  if (iso === addDays(today, 1)) return 'غداً';
  return formatDayLabel(iso);
}
