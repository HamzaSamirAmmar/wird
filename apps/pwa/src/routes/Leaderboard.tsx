import * as React from 'react';
import { Navigate } from 'react-router-dom';
import { CloudOff, Crown, Flame, Trophy } from 'lucide-react';
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
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@wird/ui-web';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/dates';

const WINDOW_KEY = 'wird.leaderboard.window';

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
  if (n >= 30) return 'شهر كامل من الإتمام 🔥';
  if (n >= 14) return 'أسبوعان متتاليان';
  if (n >= 7) return 'أسبوع كامل متتالٍ';
  return null;
}

function ordinal(rank: number): string {
  const words = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'];
  return words[rank] ?? `المركز ${rank.toLocaleString('ar-EG')}`;
}

/** Encouraging one-liner tuned to where the viewer sits. */
function motivation(
  me: LeaderboardEntry,
  rank: number,
  above: LeaderboardEntry | undefined,
): string {
  if (me.assignedCount === 0) return 'لم تبدأ بعد — أكمل ورد اليوم لتدخل السباق.';
  if (me.completedCount === 0) return 'لم تُكمل أي ورد بعد — ابدأ الآن وستصعد سريعًا.';
  if (rank === 1) return 'أنت في الصدارة، ما شاء الله — واصِل التقدّم.';
  if (me.completionRate >= 1) return 'أتممت كل أوردك — ثبِّت مركزك بالمواظبة.';
  if (above) {
    const gap = Math.round((above.completionRate - me.completionRate) * 100);
    if (gap <= 0) return `أنت على بُعد خطوة من ${ordinal(rank - 1)}.`;
    if (gap <= 15)
      return `يفصلك ${gap.toLocaleString('ar-EG')}% فقط عن ${above.fullName} — تقدَّم!`;
  }
  return 'واصِل، كل واجب يقرّبك من القمة.';
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

export default function Leaderboard() {
  const { profile } = useAuth();
  const [win, setWin] = React.useState<LeaderboardWindow>(readSavedWindow);
  const [entries, setEntries] = React.useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [groupName, setGroupName] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      localStorage.setItem(WINDOW_KEY, win);
    } catch {
      /* ignore */
    }
  }, [win]);

  const load = React.useCallback(async () => {
    if (!navigator.onLine) return;
    const { from, to } = leaderboardWindowRange(win, todayISO());
    const { data, error } = await supabase.rpc('group_leaderboard', { p_from: from, p_to: to });
    if (error) {
      setError('تعذر تحميل لوحة الصدارة');
      setEntries([]);
      return;
    }
    setError(null);
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
  }, [win]);

  React.useEffect(() => {
    setEntries(null);
    load();
  }, [load]);

  React.useEffect(() => {
    if (!profile?.groupId) return;
    supabase
      .from('groups')
      .select('name')
      .eq('id', profile.groupId)
      .single()
      .then(({ data }) => setGroupName(data?.name ?? null));
  }, [profile?.groupId]);

  // A groupmate ticking off a step can reorder the board — refetch on any checklist write.
  React.useEffect(() => {
    const channel = supabase
      .channel('leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_step_progress' }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  React.useEffect(() => {
    function onOnline() {
      setIsOnline(true);
      load();
    }
    function onOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [load]);

  if (profile?.role === 'supervisor') {
    return <Navigate to="/supervisor" replace />;
  }

  const hasData = entries !== null && entries.some((e) => e.assignedCount > 0);
  // Duties may be assigned yet nothing completed — a podium of 0%s crowning nobody is worse
  // than an honest "no one has started" prompt.
  const anyProgress = entries !== null && entries.some((e) => e.completedCount > 0);
  const myIndex = entries?.findIndex((e) => e.isMe) ?? -1;
  const myEntry = myIndex >= 0 && entries ? entries[myIndex]! : null;
  const podium = entries?.slice(0, 3) ?? [];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-canvas">
      <header className="relative overflow-hidden bg-linear-to-br from-primary-700 via-primary-800 to-primary-950 px-4 pb-6 pt-safe">
        <div className="mihrab-pattern absolute inset-0 opacity-70" />

        <div className="relative pt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-primary-100/70">لوحة الصدارة</div>
              <div className="truncate font-medium text-white">{groupName ?? 'مجموعتك'}</div>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-accent-300 ring-1 ring-white/15">
              <Trophy className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-white/10 p-1">
            {LEADERBOARD_WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWin(w)}
                aria-pressed={win === w}
                className={cn(
                  'rounded-lg py-1.5 text-xs font-medium transition-colors duration-150',
                  win === w
                    ? 'bg-white text-primary-800'
                    : 'text-primary-100/80 active:bg-white/10',
                )}
              >
                {LEADERBOARD_WINDOW_LABELS[w]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {!isOnline && entries === null ? (
          <Card className="mt-4">
            <EmptyState
              icon={CloudOff}
              title="لوحة الصدارة تحتاج اتصالاً"
              description="اتصل بالإنترنت لعرض ترتيب مجموعتك."
            />
          </Card>
        ) : entries === null ? (
          <div className="mt-4 flex flex-col gap-2">
            <Skeleton className="h-28 w-full rounded-2xl" />
            {Array.from({ length: 4 }, (_, i) => (
              <Card key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-1.5 w-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="mt-4">
            <EmptyState icon={Trophy} title={error} description="حاول مرة أخرى بعد قليل." />
          </Card>
        ) : !hasData || entries.length === 0 ? (
          <Card className="mt-4">
            <EmptyState
              icon={Trophy}
              title="السباق لم يبدأ بعد"
              description="أكمل وردك اليوم، وكن أول من يتصدّر مجموعته."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-4 pt-4">
            {myEntry && (
              <HeroCard
                entry={myEntry}
                rank={myIndex + 1}
                total={entries.length}
                above={myIndex > 0 ? entries[myIndex - 1] : undefined}
              />
            )}

            {/* Champion board — top 3 always shown; medals/crown stay muted until someone
                actually completes a duty (handled inside Podium). */}
            <Podium spots={podium} />

            {!anyProgress && (
              <p className="-mt-1 px-1 text-center text-xs text-neutral-400">
                لا إنجاز بعد في هذه المدة — كن أول من يعتلي المنصة.
              </p>
            )}

            <RankTable entries={entries} />
          </div>
        )}
      </main>
    </div>
  );
}

function HeroCard({
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
        'relative overflow-hidden rounded-2xl p-4 text-white shadow-md animate-slide-up',
        leading
          ? 'bg-linear-to-br from-accent-500 to-accent-700'
          : 'bg-linear-to-br from-primary-700 to-primary-950',
      )}
    >
      <div className="mihrab-pattern absolute inset-0 opacity-40" />
      {leading && <Crown className="absolute -left-2 -top-2 h-16 w-16 rotate-12 text-white/10" />}

      <div className="relative flex items-center gap-4">
        <div className="flex shrink-0 flex-col items-center">
          <span className="text-[11px] text-white/70">مركزك</span>
          <span className="font-display text-3xl font-bold leading-none tabular-nums">
            {rank.toLocaleString('ar-EG')}
          </span>
          <span className="text-[11px] text-white/60">من {total.toLocaleString('ar-EG')}</span>
        </div>

        <div className="h-14 w-px shrink-0 bg-white/15" />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums">{shownPct}%</span>
            <span className="text-xs text-white/70">إنجاز</span>
            {entry.currentStreak > 0 && (
              <span className="ms-auto flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium">
                <Flame className="h-3.5 w-3.5" />
                {entry.currentStreak.toLocaleString('ar-EG')}
              </span>
            )}
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-700 ease-(--ease-out-soft)"
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className="mt-2 text-xs leading-relaxed text-white/90">
            {motivation(entry, rank, above)}
          </p>
        </div>
      </div>

      {milestone && (
        <div className="relative mt-3 flex items-center gap-1.5 rounded-lg bg-white/12 px-2.5 py-1.5 text-xs font-medium">
          <Flame className="h-3.5 w-3.5" />
          {milestone}
        </div>
      )}
    </div>
  );
}

const podiumStyle: Record<
  number,
  { ring: string; pedestal: string; medal: string; height: string }
> = {
  1: {
    ring: 'ring-2 ring-accent-400',
    pedestal: 'bg-linear-to-b from-accent-200 to-accent-100 h-20',
    medal: 'text-accent-700',
    height: '',
  },
  2: {
    ring: 'ring-2 ring-neutral-300',
    pedestal: 'bg-neutral-200 h-14',
    medal: 'text-neutral-500',
    height: 'mt-6',
  },
  3: {
    ring: 'ring-2 ring-accent-200',
    pedestal: 'bg-accent-50 h-11',
    medal: 'text-accent-600',
    height: 'mt-9',
  },
};

function Podium({ spots }: { spots: LeaderboardEntry[] }) {
  // Classic podium order: 2nd, 1st, 3rd — so the winner sits centre and tallest.
  const ordered = [spots[1], spots[0], spots[2]];

  return (
    <div className="flex items-end justify-center gap-2 animate-fade-in">
      {ordered.map((entry, i) => {
        const place = i === 0 ? 2 : i === 1 ? 1 : 3;
        if (!entry) return <div key={place} className="w-1/4" />;
        return <PodiumSpot key={entry.employeeId} entry={entry} place={place} />;
      })}
    </div>
  );
}

function PodiumSpot({ entry, place }: { entry: LeaderboardEntry; place: number }) {
  const s = podiumStyle[place]!;
  const pct = Math.round(entry.completionRate * 100);
  // Someone can land on the podium with nothing done (small group, everyone else at 0 too):
  // don't dress a 0 up with a medal ring.
  const nothing = entry.completedCount === 0;

  return (
    <div className={cn('flex w-1/3 flex-col items-center', s.height)}>
      {place === 1 && !nothing && <Crown className="mb-1 h-5 w-5 text-accent-500" />}

      <div className="relative">
        <Avatar
          name={entry.fullName}
          size={place === 1 ? 'lg' : 'md'}
          className={cn(
            nothing ? 'ring-2 ring-neutral-200' : s.ring,
            place === 1 && !nothing && 'shadow-glow',
          )}
        />
        {entry.isMe && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-primary-700 px-1.5 py-0.5 text-[9px] font-medium text-white">
            أنت
          </span>
        )}
      </div>

      <div className="mt-2 line-clamp-2 max-w-full text-center text-xs font-semibold leading-tight text-neutral-800">
        {entry.fullName}
      </div>
      <div
        className={cn(
          'text-sm font-bold tabular-nums',
          nothing ? 'text-neutral-300' : pct === 100 ? 'text-mint-600' : 'text-neutral-700',
        )}
      >
        {nothing ? '—' : `${pct.toLocaleString('ar-EG')}%`}
      </div>
      {entry.currentStreak > 0 && (
        <div className="flex items-center gap-0.5 text-[10px] font-medium text-accent-600">
          <Flame className="h-2.5 w-2.5" />
          {entry.currentStreak.toLocaleString('ar-EG')}
        </div>
      )}

      <div
        className={cn(
          'mt-2 flex w-full items-start justify-center rounded-t-lg pt-1.5',
          s.pedestal,
        )}
      >
        <span className={cn('font-display text-lg font-bold tabular-nums', s.medal)}>
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

/** The complete group ranking, every member, below the podium. */
function RankTable({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div>
      <div className="mb-2 px-1 text-xs font-semibold text-neutral-500">الترتيب الكامل</div>
      <Card className="animate-fade-in overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-9 px-2 text-center">#</TableHead>
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
    </div>
  );
}
