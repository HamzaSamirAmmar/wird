import * as React from 'react';
import { ChevronDown, Crown, Flame, Trophy } from 'lucide-react';
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
import { todayISO } from '../lib/dates';

const WINDOW_KEY = 'wird.leaderboard.window';

// The full labels are too wide for the inline pill row on a phone.
const SHORT_WINDOW_LABELS: Record<LeaderboardWindow, string> = {
  '1d': 'اليوم',
  '7d': '٧ أيام',
  '30d': '٣٠ يوماً',
};

function readSavedWindow(): LeaderboardWindow {
  try {
    const saved = localStorage.getItem(WINDOW_KEY);
    if (saved === '1d' || saved === '7d' || saved === '30d') return saved;
  } catch {
    /* private mode / disabled storage — fall through to the default */
  }
  return '7d';
}

/** A short milestone label once a streak crosses a meaningful threshold, else null. */
function streakMilestone(n: number): string | null {
  if (n >= 30) return 'شهر كامل من الإتمام';
  if (n >= 14) return 'أسبوعان متتاليان';
  if (n >= 7) return 'أسبوع كامل متتالٍ';
  return null;
}

/** Encouraging one-liner tuned to where the viewer sits. */
function motivation(
  me: LeaderboardEntry,
  rank: number,
  above: LeaderboardEntry | undefined,
): string {
  if (me.assignedCount === 0) return 'أكمل ورد اليوم لتدخل السباق.';
  if (me.completedCount === 0) return 'لم تُكمل أي ورد بعد — ابدأ الآن وستصعد سريعًا.';
  if (rank === 1) return 'أنت في الصدارة — واصِل التقدّم.';
  if (me.completionRate >= 1) return 'أتممت كل أورادك — ثبِّت مركزك بالمواظبة.';
  if (above) {
    const gap = Math.round((above.completionRate - me.completionRate) * 100);
    if (gap <= 0) return 'أنت على بُعد خطوة من المركز الذي فوقك.';
    if (gap <= 15) return `يفصلك ${gap.toLocaleString('ar-EG')}% فقط عن ${above.fullName}.`;
  }
  return 'كل واجب تُتمّه يقرّبك من القمة.';
}

/** Eases a number toward its target across ~0.65s; animates on mount and on every change. */
function useCountUp(target: number, duration = 650) {
  const [value, setValue] = React.useState(0);
  const prev = React.useRef(0);

  React.useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) return;

    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/**
 * The group's standings, rendered underneath the day's duties on the home screen.
 *
 * Deliberately quieter than the duty cards above it: no gradient header of its own, flat
 * surfaces, and the full ranking table folded away behind a disclosure. The duty checklist
 * stays the thing you open the app to do; this is the reason to keep doing it.
 *
 * `reloadKey` is bumped by the parent whenever duties sync, so the board follows the same
 * refresh (including realtime) without opening a second subscription.
 */
export function GroupStandings({ reloadKey }: { reloadKey: number }) {
  const [win, setWin] = React.useState<LeaderboardWindow>(readSavedWindow);
  const [entries, setEntries] = React.useState<LeaderboardEntry[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [tableOpen, setTableOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      localStorage.setItem(WINDOW_KEY, win);
    } catch {
      /* ignore */
    }
  }, [win]);

  React.useEffect(() => {
    let cancelled = false;
    if (!navigator.onLine) return;

    const { from, to } = leaderboardWindowRange(win, todayISO());
    supabase.rpc('group_leaderboard', { p_from: from, p_to: to }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setFailed(true);
        setEntries([]);
        return;
      }
      setFailed(false);
      setEntries(
        (data ?? []).map((r) => ({
          employeeId: r.employee_id,
          fullName: r.full_name,
          assignedCount: r.assigned_count,
          completedCount: r.completed_count,
          completionRate: Number(r.completion_rate),
          currentStreak: r.current_streak,
          isMe: r.is_me,
        })),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [win, reloadKey]);

  // Offline or errored: stay silent rather than pushing an error card under the duties.
  if (failed || (entries !== null && entries.length === 0)) return null;

  const myIndex = entries?.findIndex((e) => e.isMe) ?? -1;
  const myEntry = myIndex >= 0 && entries ? entries[myIndex]! : null;
  const anyProgress = entries?.some((e) => e.completedCount > 0) ?? false;

  return (
    <section className="mt-8 border-t border-neutral-200 pt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-accent-500" />
          <h2 className="text-sm font-semibold text-neutral-800">ترتيب مجموعتك</h2>
        </div>

        <div className="flex gap-0.5 rounded-lg bg-neutral-100 p-0.5">
          {LEADERBOARD_WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWin(w)}
              aria-pressed={win === w}
              aria-label={LEADERBOARD_WINDOW_LABELS[w]}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150',
                win === w ? 'bg-surface text-primary-800 shadow-xs' : 'text-neutral-500',
              )}
            >
              {SHORT_WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
      </div>

      {entries === null ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {myEntry && (
            <StandingStrip
              entry={myEntry}
              rank={myIndex + 1}
              total={entries.length}
              above={myIndex > 0 ? entries[myIndex - 1] : undefined}
            />
          )}

          <Podium spots={entries.slice(0, 3)} />

          {!anyProgress && (
            <p className="-mt-1 text-center text-xs text-neutral-400">
              لا إنجاز بعد في هذه المدة — كن أول من يعتلي المنصة.
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={() => setTableOpen((v) => !v)}
              aria-expanded={tableOpen}
              className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-xs font-medium text-neutral-500 active:text-neutral-800"
            >
              الترتيب الكامل ({entries.length.toLocaleString('ar-EG')})
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', tableOpen && 'rotate-180')}
              />
            </button>
            {tableOpen && <RankTable entries={entries} />}
          </div>
        </div>
      )}
    </section>
  );
}

/** Your own position — the one line of this section that always matters. */
function StandingStrip({
  entry,
  rank,
  total,
  above,
}: {
  entry: LeaderboardEntry;
  rank: number;
  total: number;
  above: LeaderboardEntry | undefined;
}) {
  const pct = Math.round(entry.completionRate * 100);
  const shownPct = Math.round(useCountUp(pct));
  const leading = rank === 1 && entry.completedCount > 0;
  const milestone = streakMilestone(entry.currentStreak);

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
          <span className="font-display text-2xl font-bold leading-none tabular-nums">
            {rank.toLocaleString('ar-EG')}
          </span>
          <span className="mt-0.5 text-[10px] text-white/60">
            من {total.toLocaleString('ar-EG')}
          </span>
        </div>

        <div className="h-9 w-px shrink-0 bg-white/15" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tabular-nums">{shownPct}%</span>
            <span className="text-[11px] text-white/70">
              {entry.completedCount.toLocaleString('ar-EG')}/
              {entry.assignedCount.toLocaleString('ar-EG')}
            </span>
            {entry.currentStreak > 0 && (
              <span className="ms-auto flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">
                <Flame className="h-3 w-3" />
                {entry.currentStreak.toLocaleString('ar-EG')}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[11px] text-white/85">
            {milestone ?? motivation(entry, rank, above)}
          </p>
        </div>
      </div>
    </div>
  );
}

const podiumStyle: Record<number, { ring: string; pedestal: string; medal: string; lift: string }> =
  {
    1: {
      ring: 'ring-2 ring-accent-400',
      pedestal: 'bg-linear-to-b from-accent-200 to-accent-100 h-14',
      medal: 'text-accent-700',
      lift: '',
    },
    2: {
      ring: 'ring-2 ring-neutral-300',
      pedestal: 'bg-neutral-200 h-10',
      medal: 'text-neutral-500',
      lift: 'mt-5',
    },
    3: {
      ring: 'ring-2 ring-accent-200',
      pedestal: 'bg-accent-50 h-8',
      medal: 'text-accent-600',
      lift: 'mt-7',
    },
  };

function Podium({ spots }: { spots: LeaderboardEntry[] }) {
  // Classic podium order: 2nd, 1st, 3rd — so the winner sits centre and tallest.
  const ordered = [spots[1], spots[0], spots[2]];

  return (
    <Card variant="flat" className="flex items-end justify-center gap-2 px-2 pt-4">
      {ordered.map((entry, i) => {
        const place = i === 0 ? 2 : i === 1 ? 1 : 3;
        if (!entry) return <div key={place} className="w-1/4" />;
        return <PodiumSpot key={entry.employeeId} entry={entry} place={place} />;
      })}
    </Card>
  );
}

function PodiumSpot({ entry, place }: { entry: LeaderboardEntry; place: number }) {
  const s = podiumStyle[place]!;
  const pct = Math.round(entry.completionRate * 100);
  // Someone can land on the podium with nothing done (small group, everyone else at 0 too):
  // don't dress a 0 up with a medal.
  const nothing = entry.completedCount === 0;

  return (
    <div className={cn('flex w-1/3 flex-col items-center', s.lift)}>
      {place === 1 && !nothing && <Crown className="mb-1 h-4 w-4 text-accent-500" />}

      <div className="relative">
        <Avatar
          name={entry.fullName}
          size={place === 1 ? 'md' : 'sm'}
          className={nothing ? 'ring-2 ring-neutral-200' : s.ring}
        />
        {entry.isMe && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-primary-700 px-1.5 py-px text-[9px] font-medium text-white">
            أنت
          </span>
        )}
      </div>

      <div className="mt-2 line-clamp-2 max-w-full text-center text-[11px] font-semibold leading-tight text-neutral-800">
        {entry.fullName}
      </div>
      <div
        className={cn(
          'text-xs font-bold tabular-nums',
          nothing ? 'text-neutral-300' : pct === 100 ? 'text-mint-600' : 'text-neutral-700',
        )}
      >
        {nothing ? '—' : `${pct.toLocaleString('ar-EG')}%`}
      </div>

      <div className={cn('mt-1.5 flex w-full justify-center rounded-t-lg pt-1', s.pedestal)}>
        <span className={cn('font-display text-base font-bold tabular-nums', s.medal)}>
          {place.toLocaleString('ar-EG')}
        </span>
      </div>
    </div>
  );
}

const rankTint: Record<number, string> = {
  1: 'text-accent-700',
  2: 'text-neutral-500',
  3: 'text-accent-600',
};

/** The complete group ranking, folded away by default. */
function RankTable({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <Card variant="flat" className="animate-fade-in overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 px-2 text-center">#</TableHead>
            <TableHead className="px-2">الاسم</TableHead>
            <TableHead className="px-2 text-center">مكتمل</TableHead>
            <TableHead className="px-2 text-center">الإنجاز</TableHead>
            <TableHead className="px-2 text-center">
              <Flame className="mx-auto h-3.5 w-3.5" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry, i) => {
            const rank = i + 1;
            const pct = Math.round(entry.completionRate * 100);
            const nothing = entry.completedCount === 0;
            return (
              <TableRow key={entry.employeeId} className={cn(entry.isMe && 'bg-primary-50')}>
                <TableCell
                  className={cn(
                    'px-2 text-center text-sm font-bold tabular-nums',
                    rankTint[rank] ?? 'text-neutral-400',
                  )}
                >
                  {rank.toLocaleString('ar-EG')}
                </TableCell>
                <TableCell className="px-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={entry.fullName} size="sm" />
                    <span className="font-medium text-neutral-900">{entry.fullName}</span>
                    {entry.isMe && (
                      <span className="shrink-0 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
                        أنت
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-2 text-center text-xs tabular-nums text-neutral-500">
                  {nothing ? '—' : `${entry.completedCount}/${entry.assignedCount}`}
                </TableCell>
                <TableCell
                  className={cn(
                    'px-2 text-center text-sm font-bold tabular-nums',
                    nothing
                      ? 'text-neutral-300'
                      : pct === 100
                        ? 'text-mint-600'
                        : 'text-neutral-800',
                  )}
                >
                  {nothing ? '—' : `${pct.toLocaleString('ar-EG')}%`}
                </TableCell>
                <TableCell className="px-2 text-center">
                  {entry.currentStreak > 0 ? (
                    <span className="text-xs font-medium tabular-nums text-accent-600">
                      {entry.currentStreak.toLocaleString('ar-EG')}
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
