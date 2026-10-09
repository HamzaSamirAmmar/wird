import * as React from 'react';
import { Check, ChevronDown, Flame, Info, Trophy } from 'lucide-react';
import {
  LEADERBOARD_WINDOWS,
  leaderboardWindowRange,
  type LeaderboardEntry,
  type LeaderboardWindow,
} from '@wird/domain';
import { Avatar, Card, Skeleton, cn } from '@wird/ui-web';
import { supabase } from '../lib/supabase';
import { getMetaJSON, setMetaJSON } from '../lib/offline';

const WINDOW_KEY = 'wird.leaderboard.window';
/** Rows shown before «عرض الجميع». */
const COLLAPSED_ROWS = 10;

const WINDOW_LABELS: Record<LeaderboardWindow, string> = {
  '1d': 'اليوم',
  '7d': 'الأسبوع',
  '30d': 'الشهر',
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

/** Cache-first fetch of one window's board. `onData` may fire twice: cached, then fresh. */
async function loadBoard(
  win: LeaderboardWindow,
  today: string,
  isCancelled: () => boolean,
  onData: (entries: LeaderboardEntry[]) => void,
): Promise<'ok' | 'failed'> {
  // Keyed by day: a board is only true for the day it was computed on. Keyed by window
  // alone, yesterday's board (yesterday's streaks) stayed on screen after midnight until a
  // refresh happened to succeed — which read as the streak not resetting.
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
 * The group's standings, kept deliberately simple: your place, one list, three plain rules.
 * Beside the duties on wide screens, under them on a phone.
 *
 * `reloadKey` is bumped by the parent whenever duties sync, so the board follows the same
 * refresh (including realtime) without opening a second subscription. The parent keys this
 * component by day, so a new day starts from nothing rather than yesterday's board.
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
  const [failed, setFailed] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);

  React.useEffect(() => {
    try {
      localStorage.setItem(WINDOW_KEY, win);
    } catch {
      /* ignore */
    }
  }, [win]);

  React.useEffect(() => {
    let cancelled = false;
    loadBoard(
      win,
      today,
      () => cancelled,
      (e) => {
        setEntries(e);
        setFailed(false);
      },
    ).then((r) => {
      if (!cancelled && r === 'failed') setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [win, reloadKey, today]);

  // Offline with nothing cached, or a group of nobody: stay silent rather than pushing an
  // error card under the duties.
  if ((failed && !entries) || (entries !== null && entries.length === 0)) return null;

  const me = entries?.find((e) => e.isMe) ?? null;
  const anyAssigned = entries?.some((e) => e.daysAssigned > 0) ?? false;
  const myIndex = entries?.findIndex((e) => e.isMe) ?? -1;
  // Collapsed: the top rows, plus your own row if it sits further down.
  const rows =
    !entries || showAll || entries.length <= COLLAPSED_ROWS + 1
      ? (entries ?? [])
      : [
          ...entries.slice(0, COLLAPSED_ROWS),
          ...(myIndex >= COLLAPSED_ROWS ? [entries[myIndex]!] : []),
        ];

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
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
                win === w
                  ? 'bg-surface text-primary-800 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-800',
              )}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
      </div>

      {entries === null ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : !anyAssigned ? (
        <Card variant="flat" className="px-4 py-6 text-center text-sm text-neutral-500">
          لا أوراد في هذه المدة بعد
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {me && me.daysAssigned > 0 && <MyPlace entry={me} total={entries.length} win={win} />}

          <Card variant="flat" className="overflow-hidden">
            <ol className="divide-y divide-neutral-100">
              {rows.map((entry, i) => (
                <React.Fragment key={entry.employeeId}>
                  {/* Your row pulled up from further down the list: mark the gap. */}
                  {!showAll && i === COLLAPSED_ROWS && (
                    <li aria-hidden className="py-0.5 text-center text-xs text-neutral-300">
                      ⋯
                    </li>
                  )}
                  <Row entry={entry} win={win} />
                </React.Fragment>
              ))}
            </ol>
            {entries.length > rows.length && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full border-t border-neutral-100 py-2.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50/50"
              >
                عرض الجميع ({ar(entries.length)})
              </button>
            )}
          </Card>

          <Rules />
        </div>
      )}
    </section>
  );
}

/** Your own place, in words. */
function MyPlace({
  entry,
  total,
  win,
}: {
  entry: LeaderboardEntry;
  total: number;
  win: LeaderboardWindow;
}) {
  const leading = entry.place === 1 && entry.daysCompleted > 0;
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-sm',
        leading
          ? 'bg-linear-to-br from-accent-500 to-accent-700'
          : 'bg-linear-to-br from-primary-700 to-primary-900',
      )}
    >
      <div className="flex shrink-0 flex-col items-center leading-none">
        <span className="font-display text-2xl font-bold tabular-nums">{ar(entry.place)}</span>
        <span className="mt-1 text-[10px] text-white/65">من {ar(total)}</span>
      </div>
      <div className="h-9 w-px shrink-0 bg-white/20" />
      <div className="min-w-0 flex-1 text-sm">
        {win === '1d'
          ? entry.daysCompleted > 0
            ? 'أتممت ورد اليوم'
            : 'لم تُتمّ ورد اليوم بعد'
          : `أتممت ${ar(entry.daysCompleted)} من ${ar(entry.daysAssigned)} ${dayWord(entry.daysAssigned)}`}
      </div>
      {entry.currentStreak > 0 && (
        <span
          className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold"
          title="أيام متتالية"
        >
          <Flame className="h-3.5 w-3.5 text-accent-200" />
          {ar(entry.currentStreak)}
        </span>
      )}
    </div>
  );
}

/** «يوم / يومين / أيام / يوماً» for a count. */
function dayWord(n: number): string {
  if (n === 1) return 'يوم';
  if (n === 2) return 'يومين';
  if (n >= 3 && n <= 10) return 'أيام';
  return 'يوماً';
}

const MEDAL: Record<number, string> = {
  1: 'bg-linear-to-br from-[#f3dc9a] to-[#c99a3c] text-[#6b4a12]',
  2: 'bg-linear-to-br from-[#eef2f4] to-[#b5c1c6] text-[#4b5a60]',
  3: 'bg-linear-to-br from-[#f2d3b9] to-[#c3895c] text-[#6a3f1d]',
};

function Row({ entry, win }: { entry: LeaderboardEntry; win: LeaderboardWindow }) {
  const none = entry.daysAssigned === 0;
  const medal = !none && entry.daysCompleted > 0 ? MEDAL[entry.place] : undefined;
  const ratio = none ? 0 : entry.daysCompleted / entry.daysAssigned;
  return (
    <li className={cn('flex items-center gap-3 px-3 py-2.5', entry.isMe && 'bg-primary-50/70')}>
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
          medal ?? 'text-neutral-400',
        )}
      >
        {none ? '—' : ar(entry.place)}
      </span>
      <Avatar name={entry.fullName} size="sm" className="hidden min-[360px]:inline-flex" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-neutral-900">{entry.fullName}</span>
          {entry.isMe && (
            <span className="shrink-0 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
              أنت
            </span>
          )}
        </div>
        {win !== '1d' && !none && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={cn('h-full rounded-full', ratio === 1 ? 'bg-mint-500' : 'bg-primary-500')}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        )}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-neutral-500">
        {none ? (
          '—'
        ) : win === '1d' ? (
          entry.daysCompleted > 0 ? (
            <Check className="h-4 w-4 text-mint-600" strokeWidth={3} />
          ) : (
            <span className="text-neutral-300">—</span>
          )
        ) : (
          `${ar(entry.daysCompleted)}/${ar(entry.daysAssigned)}`
        )}
      </span>
      <span
        className={cn(
          'flex w-9 shrink-0 items-center justify-end gap-0.5 text-xs font-semibold tabular-nums',
          entry.currentStreak > 0 ? 'text-accent-600' : 'invisible',
        )}
        title="أيام متتالية"
      >
        <Flame className="h-3 w-3" />
        {ar(entry.currentStreak)}
      </span>
    </li>
  );
}

/**
 * How the board is decided, in three plain lines. Mirrors group_leaderboard /
 * employee_current_streak in SQL — change one, change the other.
 */
function Rules() {
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
