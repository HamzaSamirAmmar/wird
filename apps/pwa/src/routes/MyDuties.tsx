import * as React from 'react';
import { Navigate } from 'react-router-dom';
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
import {
  getCachedDuties,
  refreshDutiesFromServer,
  toggleStep,
  pendingOutboxCount,
  flushOutbox,
} from '../lib/duties';
import type { CachedDuty, CachedStep } from '../lib/offline';
import { BannerRail } from '../components/BannerRail';
import { DayStrip } from '../components/DayStrip';
import { GroupStandings } from '../components/GroupStandings';
import { MushafReader } from '../components/MushafReader';
import { formatRelativeDay, todayISO } from '../lib/dates';

type DutyWithSteps = CachedDuty & { steps: CachedStep[] };

const statusVariant = {
  pending: 'pending',
  in_progress: 'in_progress',
  completed: 'completed',
} as const;
const statusLabel = { pending: 'لم يبدأ', in_progress: 'جارٍ', completed: 'مكتمل' } as const;

const categoryIcon: Record<DutyCategory, typeof BookOpen> = {
  new_memorization: Sparkles,
  minor_review: RotateCcw,
  major_review: BookOpen,
};

export default function MyDuties() {
  const { profile, signOut } = useAuth();
  const [selectedDate, setSelectedDate] = React.useState(todayISO());
  const [duties, setDuties] = React.useState<DutyWithSteps[] | null>(null);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [pendingSync, setPendingSync] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  // Bumped after every server sync so the standings below refetch on the same signal,
  // instead of opening a second realtime subscription of their own.
  const [syncTick, setSyncTick] = React.useState(0);

  const employeeId = profile?.id ?? '';

  const reloadFromCache = React.useCallback(async () => {
    if (!employeeId) return;
    const all = await getCachedDuties(employeeId);
    setDuties(all.filter((d) => d.dueDate === selectedDate));
    setPendingSync(await pendingOutboxCount());
  }, [employeeId, selectedDate]);

  const refresh = React.useCallback(async () => {
    if (!employeeId) return;
    setRefreshing(true);
    try {
      await flushOutbox();
      await refreshDutiesFromServer(employeeId);
      await reloadFromCache();
      setSyncTick((t) => t + 1);
    } finally {
      // Without this the spinner spins forever whenever any step above rejects.
      setRefreshing(false);
    }
  }, [employeeId, reloadFromCache]);

  React.useEffect(() => {
    reloadFromCache();
  }, [reloadFromCache]);

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  React.useEffect(() => {
    function onOnline() {
      setIsOnline(true);
      refresh();
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
  }, [refresh]);

  React.useEffect(() => {
    if (!employeeId) return;
    const channel = supabase
      .channel(`duties-${employeeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'duties', filter: `employee_id=eq.${employeeId}` },
        () => refresh(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_step_progress' }, () =>
        refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  if (profile?.role === 'supervisor') {
    return <Navigate to="/supervisor" replace />;
  }

  async function handleToggle(step: CachedStep) {
    setDuties((prev) =>
      prev
        ? prev.map((d) =>
            d.id !== step.dutyId
              ? d
              : {
                  ...d,
                  steps: d.steps.map((s) =>
                    s.id === step.id ? { ...s, isCompleted: !s.isCompleted } : s,
                  ),
                },
          )
        : prev,
    );
    await toggleStep(step.id, !step.isCompleted);
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
                دون اتصال
              </span>
            )}
            {pendingSync > 0 && (
              <span className="rounded-full bg-accent-400/20 px-2.5 py-1 text-[11px] font-medium text-accent-100 ring-1 ring-accent-300/30">
                {pendingSync} بانتظار المزامنة
              </span>
            )}
            <IconButton
              aria-label="تسجيل الخروج"
              onClick={() => signOut()}
              className="text-primary-100 active:bg-white/10"
            >
              <LogOut className="h-4.5 w-4.5" />
            </IconButton>
          </div>
        </div>

        <div className="relative mt-4 flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/12">
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
          <DayStrip value={selectedDate} onChange={setSelectedDate} />
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        <BannerRail />

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
              <DutyCard key={duty.id} duty={duty} onToggle={handleToggle} />
            ))}
          </div>
        )}

        {/* Secondary to the checklist above, and deliberately below the fold. */}
        <GroupStandings reloadKey={syncTick} />
      </main>
    </div>
  );
}

function DutyCard({
  duty,
  onToggle,
}: {
  duty: DutyWithSteps;
  onToggle: (step: CachedStep) => void;
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
              className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors active:bg-primary-50/60"
            >
              <Checkbox
                checked={step.isCompleted}
                onCheckedChange={() => onToggle(step)}
                className="mt-0.5"
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
