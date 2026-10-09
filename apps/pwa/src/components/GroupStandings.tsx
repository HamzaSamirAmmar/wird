import * as React from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Clock,
  Flame,
  Info,
  Medal,
  Trophy,
  Users,
} from 'lucide-react';
import {
  LEADERBOARD_WINDOWS,
  LEADERBOARD_WINDOW_LABELS,
  leaderboardWindowRange,
  type LeaderboardEntry,
  type LeaderboardWindow,
} from '@wird/domain';
import {
  Avatar,
  Card,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@wird/ui-web';
import { supabase } from '../lib/supabase';
import { getMetaJSON, setMetaJSON } from '../lib/offline';

const WINDOW_KEY = 'wird.leaderboard.window';
const RANK_KEY = 'wird.leaderboard.rank';
const TABLE_KEY = 'wird.leaderboard.table';
/** How long a "you moved up/down" chip stays after the change was first seen. */
const MOVE_TTL_MS = 24 * 60 * 60 * 1000;

// The full labels are too wide for the inline pill row on a phone.
const SHORT_WINDOW_LABELS: Record<LeaderboardWindow, string> = {
  '1d': 'اليوم',
  '7d': '7 أيام',
  '30d': '30 يوماً',
};

const ar = (n: number) => n.toLocaleString('ar-u-nu-latn');

function readSavedWindow(): LeaderboardWindow {
  try {
    const saved = localStorage.getItem(WINDOW_KEY);
    if (saved === '1d' || saved === '7d' || saved === '30d') return saved;
  } catch {
    /* private mode / disabled storage — fall through to the default */
  }
  return '7d';
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

/** Eases a number toward its target across ~0.65s; animates on mount and on every change. */
function useCountUp(target: number, duration = 650) {
  const [value, setValue] = React.useState(0);
  // Where the number currently is on screen, so an interrupted animation (StrictMode's
  // double effect, or a new target mid-way) resumes from there instead of freezing.
  const shown = React.useRef(0);

  React.useEffect(() => {
    const from = shown.current;
    if (from === target) return;

    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      shown.current = from + (target - from) * eased;
      setValue(shown.current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/**
 * How many places you moved since the board last changed for you, per window — positive is
 * up. Remembered on the device, and shown for a day after the move.
 */
function useRankMovement(win: LeaderboardWindow, rank: number | null): number {
  const [delta, setDelta] = React.useState(0);
  React.useEffect(() => {
    if (rank === null) return;
    const key = `${RANK_KEY}.${win}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as {
        rank: number;
        delta: number;
        at: number;
      } | null;
      if (!saved) {
        localStorage.setItem(key, JSON.stringify({ rank, delta: 0, at: Date.now() }));
        setDelta(0);
      } else if (saved.rank !== rank) {
        const next = { rank, delta: saved.rank - rank, at: Date.now() };
        localStorage.setItem(key, JSON.stringify(next));
        setDelta(next.delta);
      } else {
        setDelta(Date.now() - saved.at < MOVE_TTL_MS ? saved.delta : 0);
      }
    } catch {
      setDelta(0);
    }
  }, [win, rank]);
  return delta;
}

/**
 * Average wrap-up time as a clock time: «٥:٤٠ ص». Past midnight (a day finished the next
 * morning on average) it says so rather than wrapping around to look early.
 */
function formatFinish(secs: number): string {
  const total = Math.round(secs / 60);
  const days = Math.floor(total / 1440);
  const mins = total % 1440;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const clock = `${ar(h12)}:${String(m)
    .padStart(2, '0')
    .replace(/\d/g, (d) => ar(Number(d)))} ${h24 < 12 ? 'ص' : 'م'}`;
  return days > 0 ? `${clock} +${ar(days)}ي` : clock;
}

/** Cache-first fetch of one window's board. `onData` may fire twice: cached, then fresh. */
async function loadBoard(
  win: LeaderboardWindow,
  today: string,
  isCancelled: () => boolean,
  onData: (entries: LeaderboardEntry[]) => void,
): Promise<'ok' | 'failed'> {
  // Keyed by day: a board is only true for the day it was computed on. Keyed by window
  // alone, yesterday's board (yesterday's streaks, yesterday's "finished today") stayed on
  // screen after midnight until a refresh happened to succeed — which read as the streak
  // not resetting. v3: adds place / meanFinishSecs.
  const cacheKey = `leaderboard:v3:${win}:${today}`;
  const cached = await getMetaJSON<LeaderboardEntry[]>(cacheKey);
  if (isCancelled()) return 'ok';
  if (cached) onData(cached);
  if (!navigator.onLine) return cached ? 'ok' : 'failed';

  const { from, to } = leaderboardWindowRange(win, today);
  const { data, error } = await supabase.rpc('group_leaderboard', { p_from: from, p_to: to });
  if (isCancelled()) return 'ok';
  // A failed refresh keeps the cached board rather than blanking it.
  if (error) return cached ? 'ok' : 'failed';
  const fresh = (data ?? []).map((r, i) => ({
    employeeId: r.employee_id,
    fullName: r.full_name,
    daysAssigned: r.assigned_count,
    daysCompleted: r.completed_count,
    completionRate: Number(r.completion_rate),
    currentStreak: r.current_streak,
    isMe: r.is_me,
    meanFinishSecs: r.mean_finish_secs == null ? null : Number(r.mean_finish_secs),
    place: r.place ?? i + 1,
  }));
  onData(fresh);
  await setMetaJSON(cacheKey, fresh);
  return 'ok';
}

/**
 * The group's standings: beside the duties on wide screens, under them on a phone.
 *
 * Built around three questions, in order: how is the group doing today (a live pulse), where
 * do I stand and what moves me up (your strip), and who leads (the podium — gold, silver and bronze
 * for the top three). The full table stays folded away; the checklist is still what you open the app
 * for, this is the reason to keep coming back.
 *
 * Edge cases it is careful about: nobody having any duty in the window (an empty state instead of a podium of zeros), and nobody having finished yet
 * (empty podium places invite you to take them, rather than handing medals to 0%).
 *
 * `reloadKey` is bumped by the parent whenever duties sync, so the board follows the same
 * refresh (including realtime) without opening a second subscription.
 */
export function GroupStandings({
  reloadKey,
  today,
  groupName,
}: {
  reloadKey: number;
  /** Today's date (follows midnight) — the boards are computed and cached per day. */
  today: string;
  groupName?: string | null;
}) {
  const [win, setWin] = React.useState<LeaderboardWindow>(readSavedWindow);
  const [entries, setEntries] = React.useState<LeaderboardEntry[] | null>(null);
  const [todayBoard, setTodayBoard] = React.useState<LeaderboardEntry[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [tableOpen, setTableOpen] = React.useState(() => {
    try {
      return localStorage.getItem(TABLE_KEY) !== '0';
    } catch {
      return true;
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(TABLE_KEY, tableOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [tableOpen]);

  React.useEffect(() => {
    try {
      localStorage.setItem(WINDOW_KEY, win);
    } catch {
      /* ignore */
    }
  }, [win]);

  React.useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    loadBoard(win, today, isCancelled, (e) => {
      setEntries(e);
      setFailed(false);
      if (win === '1d') setTodayBoard(e);
    }).then((r) => {
      if (!cancelled && r === 'failed') setFailed(true);
    });
    // Today's pulse is always shown, whatever window is selected.
    if (win !== '1d') loadBoard('1d', today, isCancelled, setTodayBoard);
    return () => {
      cancelled = true;
    };
  }, [win, reloadKey, today]);

  const myIndex = entries?.findIndex((e) => e.isMe) ?? -1;
  const myEntry = myIndex >= 0 && entries ? entries[myIndex]! : null;
  const movement = useRankMovement(win, myEntry && myEntry.daysAssigned > 0 ? myEntry.place : null);

  // Offline with nothing cached, or a group of nobody: stay silent rather than pushing an
  // error card under the duties.
  if ((failed && !entries) || (entries !== null && entries.length === 0)) return null;

  const anyAssigned = entries?.some((e) => e.daysAssigned > 0) ?? false;
  const anyProgress = entries?.some((e) => e.daysCompleted > 0) ?? false;
  // Only finishers stand on the podium; empty places stay open.
  const podium = (entries ?? []).filter((e) => e.daysCompleted > 0).slice(0, 3);

  return (
    // Phone: a section under the duties, separated by a rule. ≥lg: lives in the home
    // screen's sidebar column, so the divider and the top spacing step aside.
    <section className="mt-8 border-t border-neutral-200 pt-6 lg:mt-0 lg:border-t-0 lg:pt-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
            <Trophy className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-800">ترتيب المجموعة</h2>
            {groupName && <div className="truncate text-[11px] text-neutral-500">{groupName}</div>}
          </div>
        </div>

        <div className="flex shrink-0 gap-0.5 rounded-lg bg-neutral-100 p-0.5">
          {LEADERBOARD_WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWin(w)}
              aria-pressed={win === w}
              aria-label={LEADERBOARD_WINDOW_LABELS[w]}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150',
                win === w
                  ? 'bg-surface text-primary-800 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-800',
              )}
            >
              {SHORT_WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
      </div>

      {entries === null ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {todayBoard && <TodayPulse entries={todayBoard} />}

          {myEntry && (
            <StandingStrip
              entry={myEntry}
              rank={myEntry.place}
              total={entries.length}
              movement={movement}
            />
          )}

          {!anyAssigned ? (
            <Card variant="flat" className="flex flex-col items-center gap-2 px-4 py-6 text-center">
              <Medal className="h-7 w-7 text-neutral-300" />
              <div className="text-sm font-medium text-neutral-700">لا أوراد في هذه المدة بعد</div>
              <p className="text-xs leading-relaxed text-neutral-500">
                {win === '1d'
                  ? 'يظهر الترتيب هنا حين يُتمّ أحدكم ورد اليوم.'
                  : 'يبدأ الترتيب مع أول يوم يُتمّه أحد أفراد المجموعة.'}
              </p>
            </Card>
          ) : (
            <Podium spots={podium} />
          )}

          {anyAssigned && !anyProgress && (
            <p className="-mt-1 text-center text-xs text-neutral-500">
              المنصة شاغرة — كن أول من يعتليها.
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={() => setTableOpen((v) => !v)}
              aria-expanded={tableOpen}
              className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-800"
            >
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                الترتيب الكامل ({ar(entries.length)})
              </span>
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', tableOpen && 'rotate-180')}
              />
            </button>
            {tableOpen && <RankTable entries={entries} win={win} />}
          </div>

          <RankingRules />
        </div>
      )}
    </section>
  );
}

/** How the whole group is doing today: who has already finished, as a live nudge. */
function TodayPulse({ entries }: { entries: LeaderboardEntry[] }) {
  const due = entries.filter((e) => e.daysAssigned > 0);
  if (due.length === 0) return null;
  const finished = due.filter((e) => e.daysCompleted > 0);
  const me = entries.find((e) => e.isMe);
  const meDone = !!me && me.daysCompleted > 0;
  const pct = Math.round((finished.length / due.length) * 100);
  const shown = finished.slice(0, 5);

  let line: string;
  if (finished.length === 0) line = 'لم يُتمّ أحد ورد اليوم بعد — كن الأول!';
  else if (finished.length === due.length) line = 'أتمّت المجموعة كلها ورد اليوم — ما شاء الله!';
  else if (meDone) line = 'أنت ممن أتمّوا ورد اليوم — بارك الله فيك.';
  else if (finished.length === 1) line = `${firstName(finished[0]!.fullName)} أتمّ ورده — الحق به!`;
  else line = `${ar(finished.length)} من زملائك أتمّوا ورد اليوم — الحق بهم!`;

  return (
    <Card variant="flat" className="px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-medium text-neutral-500">أتمّوا اليوم</span>
            <span className="text-sm font-bold tabular-nums text-neutral-900">
              {ar(finished.length)}
              <span className="font-normal text-neutral-400">/{ar(due.length)}</span>
            </span>
          </div>
          <p
            className={cn(
              'mt-0.5 truncate text-xs',
              meDone || finished.length === due.length ? 'text-mint-700' : 'text-neutral-600',
            )}
          >
            {line}
          </p>
        </div>
        {shown.length > 0 && (
          <div className="flex shrink-0 -space-x-2" aria-hidden>
            {shown.map((e) => (
              <Avatar
                key={e.employeeId}
                name={e.fullName}
                size="sm"
                className={cn('h-7 w-7 text-[10px] ring-2 ring-surface', e.isMe && 'ring-mint-300')}
              />
            ))}
            {finished.length > shown.length && (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-600 ring-2 ring-surface">
                +{ar(finished.length - shown.length)}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-linear-to-l from-mint-400 to-mint-600 transition-[width] duration-700 ease-(--ease-out-soft)"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  );
}

/** Your own position — the one line of this section that always matters. */
function StandingStrip({
  entry,
  rank,
  total,
  movement,
}: {
  entry: LeaderboardEntry;
  rank: number;
  total: number;
  movement: number;
}) {
  const pct = Math.round(entry.completionRate * 100);
  const shownPct = Math.round(useCountUp(pct));
  const ranked = entry.daysAssigned > 0;
  const leading = rank === 1 && entry.daysCompleted > 0;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl px-4 py-3 text-white shadow-sm',
        leading
          ? 'bg-linear-to-br from-accent-500 to-accent-700'
          : 'bg-linear-to-br from-primary-700 to-primary-900',
      )}
    >
      <div className="mihrab-pattern absolute inset-0 opacity-40" />

      <div className="relative flex items-center gap-3">
        <div className="flex shrink-0 flex-col items-center">
          <span className="text-[10px] text-white/60">مركزك</span>
          <span className="font-display text-2xl font-bold leading-none tabular-nums">
            {ranked ? ar(rank) : '—'}
          </span>
          <span className="mt-0.5 text-[10px] text-white/60">من {ar(total)}</span>
        </div>

        <div className="h-10 w-px shrink-0 bg-white/15" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-lg font-bold tabular-nums">{ar(shownPct)}%</span>
            <span className="text-[11px] text-white/70">
              أيام مكتملة {ar(entry.daysCompleted)}/{ar(entry.daysAssigned)}
            </span>
            {movement !== 0 && ranked && (
              <span
                className={cn(
                  'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  movement > 0 ? 'bg-mint-300/25 text-mint-50' : 'bg-white/12 text-white/80',
                )}
              >
                {movement > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {ar(Math.abs(movement))}
              </span>
            )}
            {entry.currentStreak > 0 && (
              <span
                className="ms-auto flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium"
                title="أيام متتالية مكتملة"
              >
                <Flame className="h-3 w-3 text-accent-200" />
                {ar(entry.currentStreak)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PLACE = {
  1: {
    label: 'الأول',
    ring: 'ring-[3px] ring-[#e0bc66]',
    pedestal: 'h-16 bg-linear-to-b from-[#f3dc9a] via-[#e0bc66] to-[#c99a3c] text-[#6b4a12]',
    card: 'bg-linear-to-b from-[#fff8e4] to-transparent',
    pct: 'text-[#9c7025]',
    lift: '',
  },
  2: {
    label: 'الثاني',
    ring: 'ring-[3px] ring-[#c3cdd1]',
    pedestal: 'h-11 bg-linear-to-b from-[#eef2f4] via-[#d3dbdf] to-[#b5c1c6] text-[#4b5a60]',
    card: '',
    pct: 'text-neutral-600',
    lift: 'mt-6',
  },
  3: {
    label: 'الثالث',
    ring: 'ring-[3px] ring-[#d6a27a]',
    pedestal: 'h-8 bg-linear-to-b from-[#f2d3b9] via-[#dcaa82] to-[#c3895c] text-[#6a3f1d]',
    card: '',
    pct: 'text-[#9a5f32]',
    lift: 'mt-9',
  },
} as const;

function Podium({ spots }: { spots: LeaderboardEntry[] }) {
  // Classic podium order: 2nd, 1st, 3rd — so the winner sits centre and tallest.
  const ordered: [LeaderboardEntry | undefined, 1 | 2 | 3][] = [
    [spots[1], 2],
    [spots[0], 1],
    [spots[2], 3],
  ];

  return (
    <Card variant="flat" className="relative overflow-hidden px-2 pt-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-accent-50 to-transparent" />
      <div className="relative flex items-end justify-center gap-1.5 sm:gap-2">
        {ordered.map(([entry, place]) =>
          entry ? (
            <PodiumSpot key={entry.employeeId} entry={entry} place={place} />
          ) : (
            <EmptySpot key={`empty-${place}`} place={place} />
          ),
        )}
      </div>
    </Card>
  );
}

function PodiumSpot({ entry, place }: { entry: LeaderboardEntry; place: 1 | 2 | 3 }) {
  // Ties share a place: two people level at the top both read «١».
  const shownPlace = Math.min(entry.place, place);
  const s = PLACE[place];
  const pct = Math.round(entry.completionRate * 100);

  return (
    <div className={cn('flex w-1/3 min-w-0 flex-col items-center', s.lift)}>
      <div className={cn('relative mt-1 rounded-full', place === 1 && 'p-0.5')}>
        <Avatar name={entry.fullName} size={place === 1 ? 'lg' : 'md'} className={s.ring} />
        {entry.isMe && (
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-primary-700 px-1.5 py-px text-[9px] font-medium text-white shadow-xs">
            أنت
          </span>
        )}
      </div>

      <div className="mt-2.5 line-clamp-2 max-w-full px-0.5 text-center text-[11px] font-semibold leading-tight text-neutral-800">
        {entry.fullName}
      </div>
      <div className={cn('mt-0.5 flex items-center gap-1 text-xs font-bold tabular-nums', s.pct)}>
        {ar(pct)}%
        {entry.currentStreak > 1 && (
          <span className="flex items-center text-[10px] font-medium text-accent-600">
            <Flame className="h-3 w-3" />
            {ar(entry.currentStreak)}
          </span>
        )}
      </div>

      <div
        className={cn(
          'mt-1.5 flex w-full flex-col items-center justify-start rounded-t-lg pt-1 shadow-[inset_0_1px_0_rgb(255_255_255/.6)]',
          s.pedestal,
        )}
      >
        <span className="font-display text-base font-bold leading-none tabular-nums">
          {ar(shownPlace)}
        </span>
      </div>
    </div>
  );
}

/** An open place on the podium: an invitation, not a medal for 0%. */
function EmptySpot({ place }: { place: 1 | 2 | 3 }) {
  const s = PLACE[place];
  return (
    <div className={cn('flex w-1/3 min-w-0 flex-col items-center', s.lift)}>
      <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-neutral-300 text-neutral-300">
        ؟
      </span>
      <div className="mt-2.5 text-center text-[11px] font-medium text-neutral-400">مكانك هنا؟</div>
      <div className="mt-0.5 text-xs text-transparent">—</div>
      <div
        className={cn(
          'mt-1.5 flex w-full justify-center rounded-t-lg bg-neutral-100 pt-1 text-neutral-300',
          s.pedestal.split(' ')[0],
        )}
      >
        <span className="font-display text-base font-bold leading-none">{ar(place)}</span>
      </div>
    </div>
  );
}

const medalDot: Record<number, string> = {
  1: 'bg-linear-to-br from-[#f3dc9a] to-[#c99a3c] text-[#6b4a12]',
  2: 'bg-linear-to-br from-[#eef2f4] to-[#b5c1c6] text-[#4b5a60]',
  3: 'bg-linear-to-br from-[#f2d3b9] to-[#c3895c] text-[#6a3f1d]',
};

type SortKey = 'place' | 'rate' | 'finish' | 'streak';
type SortDir = 'best' | 'worst';

const SORT_NAMES: Record<SortKey, string> = {
  place: 'المركز',
  rate: 'الإنجاز',
  finish: 'وقت الإتمام',
  streak: 'السلسلة',
};

/**
 * The complete group ranking. The # column is always the official place; tapping a column
 * header re-sorts the rows by that column (best first, tap again for the reverse), like any
 * table — the active header is highlighted with its arrow, and a chip above says what the
 * rows are sorted by with a one-tap way back to the ranking order.
 */
function RankTable({ entries, win }: { entries: LeaderboardEntry[]; win: LeaderboardWindow }) {
  const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDir }>({
    key: 'place',
    dir: 'best',
  });

  const rows = React.useMemo(() => {
    const { key, dir } = sort;
    if (key === 'place' && dir === 'best') return entries;
    // Higher is better for every key (time is negated: earlier is better).
    const val = (e: LeaderboardEntry): number => {
      if (key === 'place') return -e.place;
      if (key === 'rate') return e.daysAssigned === 0 ? -1 : e.completionRate;
      if (key === 'streak') return e.currentStreak;
      return e.meanFinishSecs === null ? -Infinity : -e.meanFinishSecs;
    };
    const sign = dir === 'best' ? 1 : -1;
    return [...entries].sort((a, b) => sign * (val(b) - val(a)) || a.place - b.place);
  }, [entries, sort]);

  function sortBy(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'best' ? 'worst' : 'best' } : { key, dir: 'best' },
    );
  }

  const header = (key: SortKey, label: React.ReactNode, className?: string) => {
    const active = sort.key === key;
    const Arrow = sort.dir === 'best' ? ArrowDown : ArrowUp;
    return (
      <TableHead className={cn('px-1 text-center', className)}>
        <button
          type="button"
          onClick={() => sortBy(key)}
          aria-label={`ترتيب حسب ${SORT_NAMES[key]}`}
          className={cn(
            'inline-flex items-center justify-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors',
            active
              ? 'bg-primary-100 text-primary-800'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
          )}
        >
          {label}
          {active && <Arrow className="h-3 w-3" />}
        </button>
      </TableHead>
    );
  };

  const custom = sort.key !== 'place' || sort.dir !== 'best';

  return (
    <Card variant="flat" className="animate-fade-in overflow-hidden">
      {custom && (
        <div className="flex items-center justify-between gap-2 border-b border-neutral-100 bg-primary-50/50 px-3 py-1.5 text-[11px] text-primary-800">
          <span>
            مرتّب حسب <b>{SORT_NAMES[sort.key]}</b>
          </span>
          <button
            type="button"
            onClick={() => setSort({ key: 'place', dir: 'best' })}
            className="rounded-full bg-white px-2.5 py-0.5 font-medium shadow-xs ring-1 ring-primary-100 transition-colors hover:bg-primary-50"
          >
            ترتيب المجموعة
          </button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {header('place', '#', 'w-10')}
            <TableHead className="px-2 text-[11px]">الاسم</TableHead>
            {header('rate', 'الإنجاز')}
            {header(
              'finish',
              <Clock
                className="h-3.5 w-3.5"
                aria-label={win === '1d' ? 'وقت الإتمام' : 'متوسط الإتمام'}
              />,
            )}
            {header('streak', <Flame className="h-3.5 w-3.5" aria-label="السلسلة" />)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((entry) => {
            const rank = entry.place;
            const pct = Math.round(entry.completionRate * 100);
            const unranked = entry.daysAssigned === 0;
            const nothing = entry.daysCompleted === 0;
            const medal = !nothing ? medalDot[rank] : undefined;
            return (
              <TableRow key={entry.employeeId} className={cn(entry.isMe && 'bg-primary-50')}>
                <TableCell className="px-1 text-center">
                  {unranked ? (
                    <span className="text-neutral-300">—</span>
                  ) : medal ? (
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                        medal,
                      )}
                    >
                      {ar(rank)}
                    </span>
                  ) : (
                    <span className="text-sm font-bold tabular-nums text-neutral-400">
                      {ar(rank)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar
                      name={entry.fullName}
                      size="sm"
                      className="hidden min-[420px]:inline-flex"
                    />
                    <span className="truncate font-medium text-neutral-900">{entry.fullName}</span>
                    {entry.isMe && (
                      <span className="shrink-0 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
                        أنت
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell
                  className={cn('px-1 text-center', sort.key === 'rate' && 'bg-primary-50/40')}
                >
                  {unranked ? (
                    <span className="text-neutral-300">—</span>
                  ) : (
                    <div className="flex flex-col items-center leading-tight">
                      <span
                        className={cn(
                          'text-sm font-bold tabular-nums',
                          pct === 100 ? 'text-mint-600' : 'text-neutral-800',
                        )}
                      >
                        {ar(pct)}%
                      </span>
                      <span className="text-[10px] tabular-nums text-neutral-400">
                        {ar(entry.daysCompleted)}/{ar(entry.daysAssigned)}
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    'whitespace-nowrap px-1 text-center text-[11px] tabular-nums text-neutral-600',
                    sort.key === 'finish' && 'bg-primary-50/40',
                  )}
                >
                  {entry.meanFinishSecs === null ? (
                    <span className="text-neutral-300">—</span>
                  ) : (
                    formatFinish(entry.meanFinishSecs)
                  )}
                </TableCell>
                <TableCell
                  className={cn('px-1 text-center', sort.key === 'streak' && 'bg-primary-50/40')}
                >
                  {entry.currentStreak > 0 ? (
                    <span className="text-xs font-semibold tabular-nums text-accent-600">
                      {ar(entry.currentStreak)}
                    </span>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

/**
 * How the board is decided, in three plain lines. Mirrors group_leaderboard /
 * employee_current_streak in SQL — change one, change the other.
 */
function RankingRules() {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-neutral-500 transition-colors hover:text-neutral-800"
      >
        <Info className="h-3.5 w-3.5" />
        كيف يُحسب الترتيب؟
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="mt-2 flex animate-fade-in flex-col gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-xs leading-relaxed text-neutral-600 ring-1 ring-neutral-200/70">
          <li>
            • <b className="text-neutral-800">يُحسب لك اليوم</b> إذا أتممت ورده كاملاً.
          </li>
          <li>
            • <b className="text-neutral-800">يتقدّم</b> من أتمّ أياماً أكثر، وعند التساوي من يُنهي
            ورده أبكر.
          </li>
          <li>
            • <b className="text-neutral-800">السلسلة</b>{' '}
            <Flame className="inline h-3 w-3 text-accent-600" /> أيام متتالية أتممتها، وتبدأ من جديد
            إذا انتهى يوم دون إتمام ورده.
          </li>
        </ul>
      )}
    </div>
  );
}
