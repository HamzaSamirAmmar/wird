import * as React from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  CloudOff,
  LogOut,
  RefreshCw,
  RotateCcw,
  Sparkles,
  BookOpenText,
  FileDown,
  Loader2,
  Users,
} from 'lucide-react';
import {
  DUTY_CATEGORIES,
  DUTY_CATEGORY_LABELS,
  DUTY_CATEGORY_STEPS,
  type DutyCategory,
} from '@wird/domain';
import { formatPage, formatRange, pagesForRange } from '@wird/quran-data';
import {
  Alert,
  Avatar,
  Badge,
  Card,
  Checkbox,
  EmptyState,
  IconButton,
  ProgressBar,
  ProgressRing,
  Skeleton,
  WirdMark,
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
import { PushNotice } from '../components/PushNotice';
import { ensurePushRegistered } from '../lib/notifications';
import { useGroupName } from '../lib/groups';
import { celebrate, haptic } from '../lib/celebrate';
import { clampToVisibleRange, formatRelativeDay } from '../lib/dates';
import { useToday } from '../lib/useToday';
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

/** True when the Telegram «تحميل الورد» link asked to open straight onto the PDF download. */
function wantsDownload(link: string | null | undefined): boolean {
  if (!link) return false;
  try {
    return new URL(link, window.location.origin).searchParams.get('download') === '1';
  } catch {
    return false;
  }
}

export default function MyDuties() {
  const { profile, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useToday();
  // The day on screen lives in the URL (`/?date=…`, absent for today), so leaving for the
  // reader and coming back — or a reload — lands on the same day instead of snapping back
  // to today. Day changes replace the entry: the system back button leaves the app rather
  // than walking through every day that was tapped.
  const selectedDate = dateFromLink(`/?${searchParams.toString()}`) ?? today;
  const setSelectedDate = React.useCallback(
    (iso: string) => {
      const day = clampToVisibleRange(iso);
      setSearchParams(day === today ? {} : { date: day }, { replace: true });
    },
    [setSearchParams, today],
  );
  const [duties, setDuties] = React.useState<DutyWithSteps[] | null>(null);
  // Opened from the Telegram "تحميل الورد" button: offer the file up front. It is a prompt to
  // tap rather than an automatic download, because phones only save files on a user gesture.
  const [downloadPrompt, setDownloadPrompt] = React.useState(() =>
    wantsDownload(`/?${searchParams.toString()}`),
  );
  const [download, setDownload] = React.useState<{
    busy: boolean;
    done: number;
    total: number;
    error: string | null;
  }>({ busy: false, done: 0, total: 0, error: null });
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
  const groupName = useGroupName(profile?.groupId);

  // The Telegram link's `download=1` has done its job once read (the prompt is up); keep
  // only the day.
  React.useEffect(() => {
    if (!searchParams.has('download')) return;
    const date = searchParams.get('date');
    setSearchParams(date ? { date } : {}, { replace: true });
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
    // A new day (midnight passed with the app open) moves the synced window, today's
    // duties and the standings: sync again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, today]);

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
        setSelectedDate(dateFromLink(msg.link) ?? today);
        if (wantsDownload(msg.link)) setDownloadPrompt(true);
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
  }, [reloadFromCache, refreshSoon, setSelectedDate, today]);

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
    haptic();
    // The tick that finishes the whole day gets a small celebration — only on a real tick,
    // never on load, so reopening a finished day stays calm.
    const remaining = (duties ?? []).flatMap((d) => d.steps).filter((s) => !s.isCompleted);
    if (remaining.length === 1 && remaining[0]!.id === step.id) {
      celebrate();
      haptic([18, 60, 18]);
    }
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

  async function downloadWird() {
    if (!duties || duties.length === 0 || download.busy) return;
    setDownload({ busy: true, done: 0, total: 0, error: null });
    try {
      // Loaded on demand: the PDF engine is large and only needed here.
      const { buildWirdPdf, deliverPdf } = await import('../lib/wirdPdf');
      const blob = await buildWirdPdf(
        {
          date: selectedDate,
          duties: duties.map((d) => ({
            category: d.category,
            range: {
              surahFrom: d.scopeSurahFrom,
              ayahFrom: d.scopeAyahFrom,
              surahTo: d.scopeSurahTo,
              ayahTo: d.scopeAyahTo,
            },
          })),
        },
        (done, total) => setDownload((d) => ({ ...d, done, total })),
      );
      deliverPdf(blob, selectedDate);
      setDownloadPrompt(false);
      setDownload({ busy: false, done: 0, total: 0, error: null });
    } catch {
      setDownload({
        busy: false,
        done: 0,
        total: 0,
        error: 'تعذر إنشاء ملف الورد. حاول مرة أخرى.',
      });
    }
  }

  const allSteps = duties?.flatMap((d) => d.steps) ?? [];
  const doneSteps = allSteps.filter((s) => s.isCompleted).length;
  const isToday = selectedDate === today;
  const orderedDuties = duties
    ? DUTY_CATEGORIES.flatMap((c) => duties.filter((d) => d.category === c))
    : null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* Full-bleed header: the teal band spans the whole window on wide screens, while its
          content keeps to the same column as the page below it. */}
      <header className="relative overflow-hidden bg-linear-to-br from-primary-700 via-primary-800 to-primary-950 pt-safe">
        <div className="mihrab-pattern absolute inset-0 opacity-70" />
        <WirdMark className="pointer-events-none absolute -top-12 -end-12 hidden h-56 w-56 text-white/6 lg:block" />

        <div className={cn(SHELL, 'relative px-4 pb-4 lg:px-8 lg:pb-6')}>
          <div className="flex items-center justify-between gap-3 pt-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                name={profile?.fullName ?? '؟'}
                className="hidden bg-white/15 text-white ring-1 ring-white/20 min-[380px]:inline-flex"
              />
              <div className="min-w-0">
                <div className="text-[11px] text-primary-100/70">السلام عليكم</div>
                <div className="truncate font-medium text-white lg:text-lg">
                  {profile?.fullName}
                </div>
                {groupName && (
                  <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-primary-100/80">
                    <Users className="h-3 w-3 shrink-0" />
                    <span className="truncate">{groupName}</span>
                  </div>
                )}
              </div>
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
                  {pendingSync.toLocaleString('ar-u-nu-latn')} بانتظار المزامنة
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
                title="تسجيل الخروج"
                onClick={async () => {
                  // Give queued ticks one last chance to reach the server before the session goes.
                  if (pendingSync > 0) await refresh();
                  signOut();
                }}
                className="text-primary-100 hover:bg-white/10 hover:text-white active:bg-white/10"
              >
                <LogOut className="h-4.5 w-4.5" />
              </IconButton>
            </div>
          </div>

          {/* ≥lg: the reminder moves into a side column, aligned with the standings sidebar
              below; on a phone the stack stays greeting → reminder → progress → days. */}
          <div className="relative mt-3 lg:mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="relative lg:col-start-2 lg:row-start-1">
              <BannerRail />
            </div>

            <div className="relative mt-3 lg:col-start-1 lg:row-start-1 lg:mt-0">
              <DaySummary
                label={formatRelativeDay(selectedDate)}
                duties={orderedDuties}
                done={doneSteps}
                total={allSteps.length}
                refreshing={refreshing}
                onRefresh={refresh}
              />

              <div className="relative mt-3">
                <DayStrip value={selectedDate} today={today} onChange={setSelectedDate} />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main
        className={cn(
          SHELL,
          'flex-1 px-4 py-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] lg:px-8 lg:py-6',
        )}
      >
        {/* ≥lg: checklist in the main column, standings in a sticky sidebar beside it;
            on a phone the single column keeps standings below the fold, after the duties. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <PushNotice />

            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(today)}
                className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 ring-1 ring-inset ring-primary-100 transition-colors hover:bg-primary-100"
              >
                <CalendarCheck className="h-3.5 w-3.5" />
                العودة إلى اليوم
              </button>
            )}

            {orderedDuties === null ? (
              <div className="flex flex-col gap-3 xl:grid xl:grid-cols-2">
                {Array.from({ length: 2 }, (_, i) => (
                  <Card key={i} className="flex flex-col gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-xl" />
                      <div className="flex flex-1 flex-col gap-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <Skeleton className="h-1.5 w-full" />
                  </Card>
                ))}
              </div>
            ) : orderedDuties.length === 0 ? (
              <Card className="py-4">
                <EmptyState
                  icon={BookOpen}
                  title={isToday ? 'لم يُسند ورد اليوم بعد' : 'لا توجد واجبات في هذا اليوم'}
                  description={
                    isToday
                      ? 'سيظهر ورد اليوم هنا فور إسناده من المشرف، وستصلك رسالة بذلك.'
                      : 'راجع أياماً أخرى من الشريط أعلاه.'
                  }
                />
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                <DownloadWirdButton
                  state={download}
                  highlight={downloadPrompt}
                  onClick={downloadWird}
                />
                {/* xl: two duty cards per row — each card's checklist still reads top-down. */}
                <div className="flex flex-col gap-3 xl:grid xl:grid-cols-2 xl:items-start">
                  {orderedDuties.map((duty) => (
                    <DutyCard key={duty.id} duty={duty} onComplete={handleComplete} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Secondary to the checklist above, and deliberately out of the way. */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            {/* Keyed by day: a new day starts from nothing rather than yesterday's board. */}
            <GroupStandings key={today} reloadKey={syncTick} today={today} groupName={groupName} />
          </aside>
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-xs text-neutral-400">
          <WirdMark className="h-3.5 w-3.5 text-neutral-300" />
          <span>
            ورد · الإصدار{' '}
            <span dir="ltr" className="font-mono">
              {APP_VERSION}
            </span>
          </span>
        </div>
      </main>
    </div>
  );
}

/** One column width for header and body, so the two edges line up at every breakpoint. */
const SHELL =
  'mx-auto w-full max-w-md md:max-w-2xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] min-[1920px]:max-w-[1680px]';

const categoryTone: Record<DutyCategory, { tile: string; bar: string; dot: string }> = {
  new_memorization: {
    tile: 'bg-primary-50 text-primary-700',
    bar: 'bg-primary-600',
    dot: 'bg-primary-300',
  },
  minor_review: {
    tile: 'bg-accent-50 text-accent-700',
    bar: 'bg-accent-500',
    dot: 'bg-accent-300',
  },
  major_review: { tile: 'bg-mint-50 text-mint-700', bar: 'bg-mint-500', dot: 'bg-mint-300' },
};

function summaryLine(duties: DutyWithSteps[] | null, done: number, total: number): string {
  if (duties === null) return 'جارٍ التحميل…';
  if (total === 0) return 'لا توجد خطوات لهذا اليوم';
  if (done === total) return 'أتممت ورد اليوم — بارك الله فيك';
  const left = total - done;
  if (done === 0) return `${total.toLocaleString('ar-u-nu-latn')} خطوات بانتظارك — بسم الله`;
  if (left === 1) return 'بقيت خطوة واحدة — أتمِمها!';
  return `${done.toLocaleString('ar-u-nu-latn')} من ${total.toLocaleString('ar-u-nu-latn')} خطوة مكتملة`;
}

/** The day at a glance: overall ring and a word of encouragement. */
function DaySummary({
  label,
  duties,
  done,
  total,
  refreshing,
  onRefresh,
}: {
  label: string;
  duties: DutyWithSteps[] | null;
  done: number;
  total: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const allDone = total > 0 && done === total;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl p-4 ring-1 transition-colors duration-500',
        allDone ? 'bg-mint-300/15 ring-mint-200/30' : 'bg-white/10 ring-white/12',
      )}
    >
      <div className="relative flex items-center gap-4">
        <ProgressRing
          value={done}
          max={total}
          size={56}
          strokeWidth={5}
          className={allDone ? 'text-mint-300' : 'text-white'}
        >
          <span className="text-white">
            {total === 0 ? (
              '—'
            ) : allDone ? (
              <Check className="h-5 w-5" strokeWidth={3} />
            ) : (
              `${Math.round((done / total) * 100)}%`
            )}
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-white lg:text-lg">{label}</div>
          <div className="mt-0.5 text-xs text-primary-100/80">
            {summaryLine(duties, done, total)}
          </div>
        </div>
        <IconButton
          aria-label="تحديث"
          title="تحديث"
          onClick={onRefresh}
          className="text-primary-100 hover:bg-white/10 hover:text-white active:bg-white/10"
        >
          <RefreshCw className={cn('h-4.5 w-4.5', refreshing && 'animate-spin')} />
        </IconButton>
      </div>
    </div>
  );
}

/** Saves the day's wird as a muṣḥaf-style PDF (see lib/wirdPdf.ts). Works offline. */
function DownloadWirdButton({
  state,
  highlight,
  onClick,
}: {
  state: { busy: boolean; done: number; total: number; error: string | null };
  highlight: boolean;
  onClick: () => void;
}) {
  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2">
      {state.error && <Alert variant="danger">{state.error}</Alert>}
      <button
        type="button"
        disabled={state.busy}
        onClick={onClick}
        className={cn(
          'group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3.5 py-3 text-start transition-[background-color,box-shadow] duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60',
          highlight
            ? 'bg-primary-700 text-white shadow-glow ring-4 ring-primary-200 hover:bg-primary-800'
            : 'bg-surface text-neutral-800 shadow-xs ring-1 ring-neutral-200/80 hover:shadow-md',
          state.busy && 'cursor-progress',
        )}
      >
        {state.busy && state.total > 0 && (
          <span
            className={cn(
              'absolute inset-y-0 start-0 transition-[width] duration-300',
              highlight ? 'bg-white/10' : 'bg-primary-50',
            )}
            style={{ width: `${pct}%` }}
          />
        )}
        <span
          className={cn(
            'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            highlight ? 'bg-white/15' : 'bg-primary-50 text-primary-700',
          )}
        >
          {state.busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <FileDown className="h-5 w-5" />
          )}
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {state.busy
              ? state.total > 0
                ? `جارٍ تجهيز الملف… ${state.done.toLocaleString('ar-u-nu-latn')}/${state.total.toLocaleString('ar-u-nu-latn')}`
                : 'جارٍ تجهيز الملف…'
              : 'تحميل الورد (PDF)'}
          </span>
        </span>
      </button>
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
  const tone = categoryTone[duty.category];
  const navigate = useNavigate();

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
      : `صفحات ${pages[0]!.toLocaleString('ar-u-nu-latn')}–${pages[pages.length - 1]!.toLocaleString('ar-u-nu-latn')}`;

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-shadow duration-300',
        complete && 'ring-mint-200',
      )}
    >
      {/* Category colour on the leading edge, so the three kinds read apart at a glance. */}
      <span
        aria-hidden
        className={cn('absolute inset-y-0 start-0 w-1', complete ? 'bg-mint-400' : tone.bar)}
      />
      <div className="flex items-start gap-3 p-4">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
            complete ? 'bg-mint-50 text-mint-600' : tone.tile,
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

          {duty.scopeNote && (
            <p className="mt-2 rounded-lg bg-accent-50 px-3 py-2 text-xs leading-relaxed text-accent-800 ring-1 ring-inset ring-accent-100">
              {duty.scopeNote}
            </p>
          )}

          <button
            type="button"
            onClick={() => navigate(`/read/${duty.id}`)}
            className="group mt-2.5 flex w-full items-center gap-2 rounded-lg bg-primary-50 px-3 py-2.5 text-start text-sm font-medium text-primary-800 ring-1 ring-inset ring-primary-100 transition-colors hover:bg-primary-100 active:bg-primary-100"
          >
            <BookOpenText className="h-4 w-4 shrink-0 text-primary-600" />
            <span className="flex-1">قراءة الورد</span>
            <span className="text-[11px] font-normal text-primary-600">{pageLabel}</span>
            <ChevronLeft className="h-4 w-4 shrink-0 text-primary-400 transition-transform group-hover:-translate-x-0.5" />
          </button>

          <div className="mt-3 flex items-center gap-2">
            <ProgressBar
              value={done}
              max={duty.steps.length}
              tone={complete ? 'mint' : 'brand'}
              className="flex-1"
            />
            <span className="shrink-0 text-[11px] tabular-nums text-neutral-500">
              {done.toLocaleString('ar-u-nu-latn')}/
              {duty.steps.length.toLocaleString('ar-u-nu-latn')}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-neutral-100 border-t border-neutral-100">
        {duty.steps.map((step, i) => {
          const def = stepDefs.find((s) => s.order === step.stepOrder);
          const repeat = def?.repeat ?? 0;
          return (
            <label
              key={step.id}
              className={cn(
                'flex items-start gap-3 px-4 py-3 transition-colors',
                step.isCompleted
                  ? 'cursor-default bg-neutral-50/50'
                  : 'cursor-pointer hover:bg-primary-50/40 active:bg-primary-50/60',
              )}
            >
              {/* A done step stays done: the checkbox locks once ticked. */}
              <Checkbox
                checked={step.isCompleted}
                disabled={step.isCompleted}
                onCheckedChange={() => onComplete(step)}
                className="mt-0.5 disabled:cursor-default disabled:opacity-100"
              />
              <span className="min-w-0 flex-1">
                {duty.steps.length > 1 && (
                  <span className="mb-0.5 block text-[10px] font-medium text-neutral-400">
                    الخطوة {(i + 1).toLocaleString('ar-u-nu-latn')}
                  </span>
                )}
                <span
                  className={cn(
                    'block text-sm leading-relaxed',
                    step.isCompleted ? 'text-neutral-400 line-through' : 'text-neutral-700',
                  )}
                >
                  {def?.label ?? step.stepKey}
                </span>
              </span>
              {repeat > 1 && (
                <span
                  className={cn(
                    'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
                    step.isCompleted
                      ? 'bg-neutral-100 text-neutral-400'
                      : 'bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-100',
                  )}
                >
                  ×{repeat.toLocaleString('ar-u-nu-latn')}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </Card>
  );
}
