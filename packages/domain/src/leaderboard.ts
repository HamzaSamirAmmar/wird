// Read models for the group leaderboard (employee PWA) and the duty follow-up (supervisor
// dashboard). Backed by the public.group_leaderboard / public.duty_followup RPCs.

/** Trailing window the employee leaderboard is computed over. */
export type LeaderboardWindow = '1d' | '7d' | '30d';

export const LEADERBOARD_WINDOWS: readonly LeaderboardWindow[] = ['1d', '7d', '30d'];

export const LEADERBOARD_WINDOW_LABELS: Record<LeaderboardWindow, string> = {
  '1d': 'اليوم',
  '7d': 'آخر 7 أيام',
  '30d': 'آخر 30 يوماً',
};

/** Number of trailing days each window spans, including today. */
export const LEADERBOARD_WINDOW_DAYS: Record<LeaderboardWindow, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
};

export interface LeaderboardEntry {
  employeeId: string;
  fullName: string;
  /** Days in the window with at least one duty assigned. */
  daysAssigned: number;
  /**
   * Days in the window where EVERY duty due that day (all categories) was completed —
   * all-or-nothing per day; a partially-done day doesn't count.
   */
  daysCompleted: number;
  /** daysCompleted / daysAssigned, 0..1; 0 when nothing was assigned in the window. */
  completionRate: number;
  /** Consecutive most-recent days with every duty completed (as of the window's end). */
  currentStreak: number;
  isMe: boolean;
  /**
   * Average wrap-up time over the window's completed days, as seconds after each day's
   * midnight (Damascus) — the ranking's timing tiebreak. null when no day was completed
   * (or from a server that predates the column).
   */
  meanFinishSecs: number | null;
  /**
   * Tie-aware place (1, 2, 2, 4…) over the ranking criteria only. Falls back to the row
   * position for a server that predates the column.
   */
  place: number;
}

export interface DutyFollowupRow {
  employeeId: string;
  fullName: string;
  groupId: string;
  groupName: string;
  assignedCount: number;
  completedCount: number;
  incompleteCount: number;
  daysAssigned: number;
  daysAllComplete: number;
  /** 0..1; 0 when nothing was assigned in the range. */
  completionRate: number;
  currentStreak: number;
}

/**
 * Trailing `[from, to]` (inclusive) for a leaderboard window, as local-calendar ISO dates.
 * `todayIso` is the caller's own `YYYY-MM-DD` — duty due-dates are plain DATEs, never instants,
 * so the window must be computed in the same local calendar the UI uses.
 */
export function leaderboardWindowRange(
  window: LeaderboardWindow,
  todayIso: string,
): { from: string; to: string } {
  const to = todayIso;
  const days = LEADERBOARD_WINDOW_DAYS[window];
  const start = new Date(`${todayIso}T00:00:00`);
  start.setDate(start.getDate() - (days - 1));
  const offset = start.getTimezoneOffset() * 60_000;
  const from = new Date(start.getTime() - offset).toISOString().slice(0, 10);
  return { from, to };
}
