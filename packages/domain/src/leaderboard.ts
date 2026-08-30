// Read models for the group leaderboard (employee PWA) and the duty follow-up (supervisor
// dashboard). Backed by the public.group_leaderboard / public.duty_followup RPCs.

/** Trailing window the employee leaderboard is computed over. */
export type LeaderboardWindow = '1d' | '7d' | '30d';

export const LEADERBOARD_WINDOWS: readonly LeaderboardWindow[] = ['1d', '7d', '30d'];

export const LEADERBOARD_WINDOW_LABELS: Record<LeaderboardWindow, string> = {
  '1d': 'اليوم',
  '7d': 'آخر ٧ أيام',
  '30d': 'آخر ٣٠ يوماً',
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
  assignedCount: number;
  completedCount: number;
  /** 0..1; 0 when nothing was assigned in the window. */
  completionRate: number;
  /** Consecutive most-recent days with every duty completed (as of today, window-independent). */
  currentStreak: number;
  isMe: boolean;
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
