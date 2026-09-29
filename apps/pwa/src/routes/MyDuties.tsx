import * as React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  CloudOff,
  LogOut,
  RefreshCw,
  RotateCcw,
  Sparkles,
  BookOpenText,
} from 'lucide-react';
import { DUTY_CATEGORY_LABELS, DUTY_CATEGORY_STEPS, type DutyCategory } from '@wird/domain';
import { formatPage, formatRange, pagesForRange } from '@wird/quran-data';
import {
  Badge,
  Card,
  Checkbox,
  EmptyState,
  IconButton,
  ProgressBar,
  ProgressRing,
  Skeleton,
  cn,
} from '@wird/ui-web';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { completeStep, getCachedDuties, pendingOutboxCount, syncNow } from '../lib/duties';
import { useOnline } from '../lib/connectivity';
import { getLastSyncedAt, type CachedDuty, type CachedStep } from '../lib/offline';
import { BannerRail } from '../components/BannerRail';
import { DayStrip } from '../components/DayStrip';
import { GroupStandings } from '../components/GroupStandings';
import { MushafReader } from '../components/MushafReader';
import { PushNotice } from '../components/PushNotice';
import { ensurePushRegistered } from '../lib/notifications';
import { clampToVisibleRange, formatRelativeDay, todayISO } from '../lib/dates';
import { APP_VERSION } from '../version';

type DutyWithSteps = CachedDuty & { steps: CachedStep[] };

const statusVariant = {
  pending: 'pending',
  in_progress: 'in_progress',
  completed: 'completed',
} as const;
const statusLabel = { pending: 'لم يبدأ', in_progress: 'جارٍ', completed: 'مكتمل' } as const;

/**
 * How stale the cached data is, in words. Shown in place of a bare "دون اتصال" badge: the app
 * works offline either way, so what an employee actually needs to know is whether the checklist
 * in front of them reflects what the supervisor assigned.
 */
function formatSyncAge(lastSynced: number | null): string {
  if (lastSynced === null) return 'دون اتصال';
  const minutes = Math.floor((Date.now() - lastSynced) / 60_000);
  if (minutes < 1) return 'محدّث الآن';
  if (minutes < 60) return `آخر تحديث قبل ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `آخر تحديث قبل ${hours} س`;
  return `آخر تحديث قبل ${Math.floor(hours / 24)} يوم`;
}

const categoryIcon: Record<DutyCategory, typeof BookOpen> = {
  new_memorization: Sparkles,
  minor_review: RotateCcw,
  major_review: BookOpen,
};

/** `?date=YYYY-MM-DD` (from a notification tap), clamped to what the rail can show. */
function dateFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const date = new URL(link, window.location.origin).searchParams.get('date');
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? clampToVisibleRange(date) : null;
  } catch {
    return null;
  }
}

export default function MyDuties() {
  const { profile, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = React.useState(
    () => dateFromLink(`/?${searchParams.toString()}`) ?? todayISO(),
  );
  const [duties, setDuties] = React.useState<DutyWithSteps[] | null>(null);
  const isOnline = useOnline();
  const [pendingSync, setPendingSync] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  // Brief "synced" confirmation when queued ticks finally reach the server.
  const [justSynced, setJustSynced] = React.useState(false);
  // Bumped after every server sync so the standings below refetch on the same signal,
  // instead of opening a second realtime subscription of their own.
  const [syncTick, setSyncTick] = React.useState(0);
  const [lastSynced, setLastSynced] = React.useState<number | null>(null);

  const employeeId = profile?.id ?? '';

  // The notification's ?date= has done its job once read; drop it so a reload opens on today.
  React.useEffect(() => {
    if (searchParams.has('date')) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadFromCache = React.useCallback(async () => {
    if (!employeeId) return;
    const all = await getCachedDuties(employeeId);
    setDuties(all.filter((d) => d.dueDate === selectedDate));
    setPendingSync(await pendingOutboxCount());
    setLastSynced(await getLastSyncedAt());
  }, [employeeId, selectedDate]);

  const pendingRef = React.useRef(0);
  pendingRef.current = pendingSync;

  const refresh = React.useCallback(async () => {
    if (!employeeId) return;
    const hadPending = pendingRef.current > 0;
    setRefreshing(true);
    try {
      await syncNow(employeeId);
      await reloadFromCache();
      setSyncTick((t) => t + 1);
      if (hadPending && (await pendingOutboxCount()) === 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 2500);
      }
    } finally {
      // Without this the spinner spins forever whenever any step above rejects.
      setRefreshing(false);
    }
  }, [employeeId, reloadFromCache]);

  // Realtime and service-worker messages arrive in bursts (one assignment = several rows);
  // coalesce them into one sync.
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSoon = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => refresh(), 500);
  }, [refresh]);

  React.useEffect(() => {
    reloadFromCache();
  }, [reloadFromCache]);

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  React.useEffect(() => {
    // An installed PWA resumed from the background never remounts, so the mount-time refresh
    // does not fire — it can sit for days showing a stale checklist with a full outbox. Coming
    // back to the foreground is the reliable "the user is looking at this again" signal.
    function onVisible() {
      if (document.visibilityState === 'visible') {
        refreshSoon();
        if (employeeId) ensurePushRegistered(employeeId);
      }
    }

    window.addEventListener('online', refreshSoon);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', refreshSoon);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshSoon, employeeId]);

  // While ticks are waiting and the app is on screen, keep retrying: `online` does not fire
  // when Wi-Fi was connected all along but the internet behind it was not.
  React.useEffect(() => {
    if (pendingSync === 0) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [pendingSync, refresh]);

  // Messages from the service worker (src/sw.ts).
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function onMessage(event: MessageEvent) {
      const msg = event.data as { type?: string; link?: string } | null;
      if (msg?.type === 'wird:open') {
        // A notification was tapped while the app was already open.
        setSelectedDate(dateFromLink(msg.link) ?? todayISO());
        refreshSoon();
      } else if (msg?.type === 'wird:push' || msg?.type === 'wird:synced') {
        // The worker already wrote the pushed day / flushed the outbox; show it, then confirm
        // with the server.
        reloadFromCache();
        refreshSoon();
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [reloadFromCache, refreshSoon]);

  React.useEffect(() => {
    if (!employeeId) return;
    const channel = supabase
      .channel(`duties-${employeeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'duties', filter: `employee_id=eq.${employeeId}` },
        () => refreshSoon(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_step_progress' }, () =>
        refreshSoon(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  // Idempotent token re-registration (covers token rotation and account switches), and ask the
  // browser not to evict the offline cache under storage pressure.
  React.useEffect(() => {
    if (!employeeId) return;
    ensurePushRegistered(employeeId);
    navigator.storage?.persist?.().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  if (profile && profile.role !== 'employee') {
    return <Navigate to="/supervisor" replace />;
  }

  // Ticking a step is final: a completed step cannot be unticked.
  async function handleComplete(step: CachedStep) {
    if (step.isCompleted) return;
    setDuties((prev) =>
      prev
        ? prev.map((d) =>
            d.id !== step.dutyId
              ? d
              : {
                  ...d,
                  steps: d.steps.map((s) => (s.id === step.id ? { ...s, isCompleted: true } : s)),
                },
          )
        : prev,
    );
    await completeStep(step.id);
    await reloadFromCache();
  }

  const allSteps = duties?.flatMap((d) => d.steps) ?? [];
  const doneSteps = allSteps.filter((s) => s.isCompleted).length;
  const allDone = allSteps.length > 0 && doneSteps === allSteps.length;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-canvas">
      <header className="relative overflow-hidden bg-linear-to-br from-primary-700 via-primary-800 to-primary-950 px-4 pb-4 pt-safe">
        <div className="mihrab-pattern absolute inset-0 opacity-70" />

        <div className="relative flex items-center justify-between gap-3 pt-3">
          <div className="min-w-0">
            <div className="text-[11px] text-primary-100/70">السلام عليكم</div>
            <div className="truncate font-medium text-white">{profile?.fullName}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!isOnline && (
              <span className="flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[11px] text-primary-50">
                <CloudOff className="h-3.5 w-3.5" />
                {/* Naming the age of the data matters more than saying "offline": the
                    checklist still works, the question is whether it is current. */}
                {formatSyncAge(lastSynced)}
              </span>
            )}
            {pendingSync > 0 ? (
              <span className="rounded-full bg-accent-400/20 px-2.5 py-1 text-[11px] font-medium text-accent-100 ring-1 ring-accent-300/30">
                {pendingSync.toLocaleString('ar-EG')} بانتظار المزامنة
              </span>
            ) : (
              justSynced && (
                <span className="flex animate-fade-in items-center gap-1 rounded-full bg-mint-300/20 px-2.5 py-1 text-[11px] font-medium text-mint-100 ring-1 ring-mint-300/30">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  تمت المزامنة
                </span>
              )
            )}
            <IconButton
              aria-label="تسجيل الخروج"
              onClick={async () => {
                // Give queued ticks one last chance to reach the server before the session goes.
                if (pendingSync > 0) await refresh();
                signOut();
              }}
              className="text-primary-100 active:bg-white/10"
            >
              <LogOut className="h-4.5 w-4.5" />
            </IconButton>
          </div>
        </div>

        <div className="relative">
          <BannerRail />
        </div>

        <div className="relative mt-3 flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/12">
          <ProgressRing
            value={doneSteps}
            max={allSteps.length}
            size={56}
            strokeWidth={5}
            className={allDone ? 'text-mint-300' : 'text-white'}
          >
            <span className="text-white">
              {allSteps.length === 0 ? '—' : `${Math.round((doneSteps / allSteps.length) * 100)}%`}
            </span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-white">{formatRelativeDay(selectedDate)}</div>
            <div className="mt-0.5 text-xs text-primary-100/75">
              {duties === null
                ? 'جارٍ التحميل…'
                : allSteps.length === 0
                  ? 'لا توجد خطوات لهذا اليوم'
                  : allDone
                    ? 'أتممت ورد اليوم — بارك الله فيك'
                    : `${doneSteps} من ${allSteps.length} خطوة مكتملة`}
            </div>
          </div>
          <IconButton
            aria-label="تحديث"
            onClick={refresh}
            className="text-primary-100 active:bg-white/10"
          >
            <RefreshCw className={cn('h-4.5 w-4.5', refreshing && 'animate-spin')} />
          </IconButton>
        </div>

        <div className="relative mt-3">
          <DayStrip
            value={selectedDate}
            onChange={(iso) => setSelectedDate(clampToVisibleRange(iso))}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        <PushNotice />

        {selectedDate !== todayISO() && (
          <button
            onClick={() => setSelectedDate(todayISO())}
            className="mb-3 text-xs font-medium text-primary-700"
          >
            العودة لليوم
          </button>
        )}

        {duties === null ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 2 }, (_, i) => (
              <Card key={i} className="flex flex-col gap-3 p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-1.5 w-full" />
              </Card>
            ))}
          </div>
        ) : duties.length === 0 ? (
          <Card>
            <EmptyState
              icon={BookOpen}
              title="لا توجد واجبات في هذا اليوم"
              description="راجع أياماً أخرى من الشريط أعلاه، أو انتظر إسناد المشرف."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {duties.map((duty) => (
              <DutyCard key={duty.id} duty={duty} onComplete={handleComplete} />
            ))}
          </div>
        )}

        {/* Secondary to the checklist above, and deliberately below the fold. */}
        <GroupStandings reloadKey={syncTick} />

        <div className="mt-8 text-center text-xs text-neutral-400">
          <span>الإصدار </span>
          <span dir="ltr" className="font-mono">
            {APP_VERSION}
          </span>
        </div>
      </main>
    </div>
  );
}

function DutyCard({
  duty,
  onComplete,
}: {
  duty: DutyWithSteps;
  onComplete: (step: CachedStep) => void;
}) {
  const stepDefs = DUTY_CATEGORY_STEPS[duty.category];
  const done = duty.steps.filter((s) => s.isCompleted).length;
  const complete = duty.steps.length > 0 && done === duty.steps.length;
  const Icon = categoryIcon[duty.category];
  const [readerOpen, setReaderOpen] = React.useState(false);

  const range = {
    surahFrom: duty.scopeSurahFrom,
    ayahFrom: duty.scopeAyahFrom,
    surahTo: duty.scopeSurahTo,
    ayahTo: duty.scopeAyahTo,
  };
  const pages = pagesForRange(range);
  const pageLabel =
    pages.length === 1
      ? formatPage(pages[0]!)
      : `صفحات ${pages[0]!.toLocaleString('ar-EG')}–${pages[pages.length - 1]!.toLocaleString('ar-EG')}`;

  return (
    <Card className={cn('overflow-hidden', complete && 'ring-mint-200')}>
      <div className="flex items-start gap-3 p-4">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            complete ? 'bg-mint-50 text-mint-600' : 'bg-primary-50 text-primary-600',
          )}
        >
          {complete ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-neutral-900">
                {DUTY_CATEGORY_LABELS[duty.category]}
              </div>
              <div className="mt-0.5 text-sm text-neutral-500">{formatRange(range)}</div>
            </div>
            <Badge variant={statusVariant[duty.status]} dot>
              {statusLabel[duty.status]}
            </Badge>
          </div>

          <button
            type="button"
            onClick={() => setReaderOpen(true)}
            className="mt-2.5 flex w-full items-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-start text-sm font-medium text-primary-800 ring-1 ring-inset ring-primary-100 transition-colors active:bg-primary-100"
          >
            <BookOpenText className="h-4 w-4 shrink-0 text-primary-600" />
            <span className="flex-1">قراءة الورد</span>
            <span className="text-[11px] font-normal text-primary-600">{pageLabel}</span>
          </button>

          <div className="mt-3 flex items-center gap-2">
            <ProgressBar
              value={done}
              max={duty.steps.length}
              tone={complete ? 'mint' : 'brand'}
              className="flex-1"
            />
            <span className="shrink-0 text-[11px] tabular-nums text-neutral-500">
              {done}/{duty.steps.length}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-neutral-100 border-t border-neutral-100">
        {duty.steps.map((step) => {
          const def = stepDefs.find((s) => s.order === step.stepOrder);
          return (
            <label
              key={step.id}
              className={cn(
                'flex items-start gap-3 px-4 py-3 transition-colors',
                step.isCompleted ? 'cursor-default' : 'cursor-pointer active:bg-primary-50/60',
              )}
            >
              {/* A done step stays done: the checkbox locks once ticked. */}
              <Checkbox
                checked={step.isCompleted}
                disabled={step.isCompleted}
                onCheckedChange={() => onComplete(step)}
                className="mt-0.5 disabled:cursor-default disabled:opacity-100"
              />
              <span
                className={cn(
                  'text-sm leading-relaxed',
                  step.isCompleted ? 'text-neutral-400 line-through' : 'text-neutral-700',
                )}
              >
                {def?.label ?? step.stepKey}
              </span>
            </label>
          );
        })}
      </div>

      <MushafReader
        open={readerOpen}
        onOpenChange={setReaderOpen}
        range={range}
        title={DUTY_CATEGORY_LABELS[duty.category]}
      />
    </Card>
  );
}
