import * as React from 'react';
import { Navigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, LogOut, WifiOff, RefreshCw } from 'lucide-react';
import { DUTY_CATEGORY_LABELS, DUTY_CATEGORY_STEPS } from '@wird/domain';
import { formatRange } from '@wird/quran-data';
import { Badge, Checkbox, Card, CardContent, Spinner } from '@wird/ui-web';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { getCachedDuties, refreshDutiesFromServer, toggleStep, pendingOutboxCount, flushOutbox } from '../lib/duties';
import type { CachedDuty, CachedStep } from '../lib/offline';

type DutyWithSteps = CachedDuty & { steps: CachedStep[] };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(iso: string) {
  const date = new Date(iso + 'T00:00:00');
  return date.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });
}

const statusVariant = { pending: 'pending', in_progress: 'in_progress', completed: 'completed' } as const;
const statusLabel = { pending: 'لم يبدأ', in_progress: 'جارٍ', completed: 'مكتمل' } as const;

export default function MyDuties() {
  const { profile, signOut } = useAuth();
  const [selectedDate, setSelectedDate] = React.useState(todayISO());
  const [duties, setDuties] = React.useState<DutyWithSteps[] | null>(null);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [pendingSync, setPendingSync] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

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
    await flushOutbox();
    await refreshDutiesFromServer(employeeId);
    await reloadFromCache();
    setRefreshing(false);
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'duty_step_progress' },
        () => refresh(),
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
                  steps: d.steps.map((s) => (s.id === step.id ? { ...s, isCompleted: !s.isCompleted } : s)),
                }
          )
        : prev,
    );
    await toggleStep(step.id, !step.isCompleted);
    await reloadFromCache();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-700 text-sm font-bold text-white">
            و
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-900">{profile?.fullName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOnline && <WifiOff className="h-4 w-4 text-neutral-400" />}
          {pendingSync > 0 && (
            <Badge variant="in_progress">{pendingSync} بانتظار المزامنة</Badge>
          )}
          <button onClick={() => signOut()} className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex items-center justify-center gap-3 border-b border-neutral-200 bg-white py-3">
        <button
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="text-sm font-medium text-neutral-800">{formatDayLabel(selectedDate)}</div>
        <button
          onClick={() => setSelectedDate((d) => addDays(d, -1))}
          className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          {selectedDate !== todayISO() && (
            <button onClick={() => setSelectedDate(todayISO())} className="text-xs font-medium text-primary-700">
              العودة لليوم
            </button>
          )}
          <button
            onClick={refresh}
            className="ms-auto flex items-center gap-1 text-xs font-medium text-neutral-500"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>

        {duties === null ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : duties.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">لا توجد واجبات في هذا اليوم</p>
        ) : (
          <div className="flex flex-col gap-4">
            {duties.map((duty) => (
              <DutyCard key={duty.id} duty={duty} onToggle={handleToggle} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DutyCard({ duty, onToggle }: { duty: DutyWithSteps; onToggle: (step: CachedStep) => void }) {
  const stepDefs = DUTY_CATEGORY_STEPS[duty.category];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-semibold text-neutral-900">{DUTY_CATEGORY_LABELS[duty.category]}</div>
            <div className="text-sm text-neutral-500">
              {formatRange({
                surahFrom: duty.scopeSurahFrom,
                ayahFrom: duty.scopeAyahFrom,
                surahTo: duty.scopeSurahTo,
                ayahTo: duty.scopeAyahTo,
              })}
            </div>
          </div>
          <Badge variant={statusVariant[duty.status]}>{statusLabel[duty.status]}</Badge>
        </div>

        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
          {duty.steps.map((step) => {
            const def = stepDefs.find((s) => s.order === step.stepOrder);
            return (
              <label key={step.id} className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={step.isCompleted}
                  onCheckedChange={() => onToggle(step)}
                  className="mt-0.5"
                />
                <span
                  className={`text-sm leading-relaxed ${step.isCompleted ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}
                >
                  {def?.label ?? step.stepKey}
                </span>
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
