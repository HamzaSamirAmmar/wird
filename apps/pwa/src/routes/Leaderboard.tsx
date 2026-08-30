import * as React from 'react';
import { Navigate } from 'react-router-dom';
import { CloudOff, Flame, Trophy } from 'lucide-react';
import {
  LEADERBOARD_WINDOWS,
  LEADERBOARD_WINDOW_LABELS,
  leaderboardWindowRange,
  type LeaderboardEntry,
  type LeaderboardWindow,
} from '@wird/domain';
import { Avatar, Card, EmptyState, ProgressBar, Skeleton, cn } from '@wird/ui-web';
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
  const myIndex = entries?.findIndex((e) => e.isMe) ?? -1;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-canvas">
      <header className="relative overflow-hidden bg-linear-to-br from-primary-700 via-primary-800 to-primary-950 px-4 pb-5 pt-safe">
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

      <main className="flex-1 px-4 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {!isOnline && entries === null ? (
          <Card>
            <EmptyState
              icon={CloudOff}
              title="لوحة الصدارة تحتاج اتصالاً"
              description="اتصل بالإنترنت لعرض ترتيب مجموعتك."
            />
          </Card>
        ) : entries === null ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }, (_, i) => (
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
          <Card>
            <EmptyState icon={Trophy} title={error} description="حاول مرة أخرى بعد قليل." />
          </Card>
        ) : !hasData ? (
          <Card>
            <EmptyState
              icon={Trophy}
              title="لا توجد بيانات كافية بعد"
              description="أكمل وردك اليومي، وستظهر النتائج هنا."
            />
          </Card>
        ) : (
          <ol className="flex flex-col gap-2">
            {entries.map((entry, i) => (
              <LeaderRow key={entry.employeeId} rank={i + 1} entry={entry} />
            ))}
          </ol>
        )}
      </main>

      {myIndex >= 5 && entries && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] mx-auto max-w-md px-4">
          <div className="rounded-xl bg-primary-800 px-4 py-2.5 text-white shadow-lg ring-1 ring-primary-900/20">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold tabular-nums">#{myIndex + 1}</span>
              <span className="flex-1 truncate">مركزك</span>
              <span className="tabular-nums">
                {Math.round(entries[myIndex]!.completionRate * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const rankAccent: Record<number, string> = {
  1: 'bg-accent-100 text-accent-800 ring-accent-300',
  2: 'bg-neutral-200 text-neutral-700 ring-neutral-300',
  3: 'bg-accent-50 text-accent-700 ring-accent-200',
};

function LeaderRow({ rank, entry }: { rank: number; entry: LeaderboardEntry }) {
  const pct = Math.round(entry.completionRate * 100);
  const nothing = entry.assignedCount === 0;

  return (
    <li>
      <Card className={cn('flex items-center gap-3 p-3', entry.isMe && 'ring-2 ring-primary-300')}>
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ring-1',
            rankAccent[rank] ?? 'bg-neutral-100 text-neutral-500 ring-neutral-200',
          )}
        >
          {rank}
        </span>

        <Avatar name={entry.fullName} size="sm" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-neutral-900">
              {entry.fullName}
            </span>
            {entry.isMe && (
              <span className="shrink-0 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
                أنت
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <ProgressBar
              value={entry.completedCount}
              max={entry.assignedCount || 1}
              tone={pct === 100 ? 'mint' : 'brand'}
              className="flex-1"
            />
            <span className="shrink-0 text-[11px] tabular-nums text-neutral-500">
              {nothing ? '—' : `${entry.completedCount}/${entry.assignedCount}`}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              'text-sm font-bold tabular-nums',
              nothing ? 'text-neutral-300' : pct === 100 ? 'text-mint-600' : 'text-neutral-800',
            )}
          >
            {nothing ? '—' : `${pct}%`}
          </span>
          {entry.currentStreak > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] font-medium text-accent-600">
              <Flame className="h-3 w-3" />
              {entry.currentStreak}
            </span>
          )}
        </div>
      </Card>
    </li>
  );
}
