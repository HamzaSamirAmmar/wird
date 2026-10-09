import * as React from 'react';
import { Check, ChevronUp, Minus, Plus, RotateCcw } from 'lucide-react';
import { DUTY_CATEGORY_STEPS, type DutyCategory } from '@wird/domain';
import { cn } from '@wird/ui-web';
import type { CachedStep } from '../lib/offline';
import { haptic } from '../lib/celebrate';

const ar = (n: number) => n.toLocaleString('ar-u-nu-latn');

function storageKey(dutyId: string) {
  return `wird.counter.${dutyId}`;
}

function readCounts(dutyId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey(dutyId));
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeCounts(dutyId: string, counts: Record<string, number>) {
  try {
    localStorage.setItem(storageKey(dutyId), JSON.stringify(counts));
  } catch {
    /* private mode — the counter still works for this visit */
  }
}

interface CounterStep {
  step: CachedStep;
  label: string;
  /** null = open-ended ("several times, as each needs") */
  target: number | null;
}

/**
 * Repetition counter docked above the reader's page bar: several steps ask for the passage to
 * be read seven times, and losing count mid-way is the common failure. One big tap target per
 * reading, dots that fill toward the target, and — once it is reached — a one-tap way to tick
 * the step in the checklist (still an explicit tap: ticks are final).
 *
 * Counts live in localStorage per duty, so they survive leaving the reader, a reload, or
 * going offline. They are a reading aid only — nothing here is synced.
 */
export function RepeatCounter({
  dutyId,
  category,
  steps,
  onCompleteStep,
}: {
  dutyId: string;
  category: DutyCategory;
  steps: CachedStep[];
  onCompleteStep?: (step: CachedStep) => Promise<void> | void;
}) {
  const defs = DUTY_CATEGORY_STEPS[category];
  const items: CounterStep[] = React.useMemo(
    () =>
      steps.map((step) => {
        const def = defs.find((d) => d.order === step.stepOrder);
        return { step, label: def?.label ?? step.stepKey, target: def?.repeat ?? null };
      }),
    [steps, defs],
  );

  const [counts, setCounts] = React.useState<Record<string, number>>(() => readCounts(dutyId));
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [bump, setBump] = React.useState(0);
  const [marking, setMarking] = React.useState(false);

  // Default: the first unfinished step that counts readings, else the first unfinished step.
  const fallbackKey = (
    items.find((i) => !i.step.isCompleted && (i.target ?? 2) > 1) ??
    items.find((i) => !i.step.isCompleted) ??
    items[0]
  )?.step.stepKey;
  const currentKey =
    activeKey && items.some((i) => i.step.stepKey === activeKey) ? activeKey : fallbackKey;

  React.useEffect(() => writeCounts(dutyId, counts), [dutyId, counts]);

  const index = items.findIndex((i) => i.step.stepKey === currentKey);
  const active = index >= 0 ? items[index]! : null;
  const count = active ? (counts[active.step.stepKey] ?? 0) : 0;
  const target = active?.target ?? null;
  const reached = target !== null && count >= target;
  const stepDone = active?.step.isCompleted ?? false;

  const change = React.useCallback(
    (delta: number) => {
      if (!active) return;
      const key = active.step.stepKey;
      const next = Math.max(0, count + delta);
      if (delta > 0) {
        haptic(target !== null && next === target ? [20, 50, 20] : 10);
        setBump((b) => b + 1);
      }
      setCounts((prev) => ({ ...prev, [key]: next }));
    },
    [active, target, count],
  );

  // Desktop: Space or "+" counts a reading, "-" takes one back.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === ' ' || e.key === '+' || e.key === '=') {
        e.preventDefault();
        change(1);
      } else if (e.key === '-') {
        e.preventDefault();
        change(-1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [change]);

  if (!active) return null;

  async function markDone() {
    if (!active || stepDone || !onCompleteStep) return;
    setMarking(true);
    try {
      await onCompleteStep(active.step);
      // Move on to the next unfinished step, if any.
      const next = items.find((i, k) => k !== index && !i.step.isCompleted);
      if (next) setActiveKey(next.step.stepKey);
    } finally {
      setMarking(false);
    }
  }

  const ratio = target ? Math.min(1, count / target) : 0;

  return (
    <div className="relative flex-none border-t border-[#b08a3e]/40 bg-[#f7efd9] text-[#0b4f55]">
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="إغلاق"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-x-2 bottom-full z-20 mb-2 animate-slide-up overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5 sm:inset-x-auto sm:start-3 sm:w-96">
            <div className="border-b border-neutral-100 px-4 py-2.5 text-xs font-semibold text-neutral-500">
              الخطوات
            </div>
            <ul className="max-h-[50dvh] overflow-y-auto py-1">
              {items.map((item, k) => {
                const c = counts[item.step.stepKey] ?? 0;
                return (
                  <li key={item.step.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveKey(item.step.stepKey);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-2.5 text-start transition-colors hover:bg-primary-50',
                        k === index && 'bg-primary-50/70',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                          item.step.isCompleted
                            ? 'bg-mint-500 text-white'
                            : 'bg-primary-100 text-primary-700',
                        )}
                      >
                        {item.step.isCompleted ? <Check className="h-3.5 w-3.5" /> : ar(k + 1)}
                      </span>
                      <span className="min-w-0 flex-1 text-sm leading-relaxed text-neutral-700">
                        {item.label}
                      </span>
                      <span className="mt-0.5 shrink-0 text-xs tabular-nums text-neutral-400">
                        {item.target ? `${ar(c)}/${ar(item.target)}` : ar(c)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-2.5 sm:px-5">
        {/* Which step is being counted — tap to switch. */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-[#0b4f55]/5"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[#9c7025]">
              {items.length > 1
                ? `الخطوة ${ar(index + 1)} من ${ar(items.length)}`
                : 'عدّاد القراءة'}
              {stepDone && (
                <span className="flex items-center gap-0.5 text-mint-600">
                  · <Check className="h-3 w-3" /> مكتملة
                </span>
              )}
              <ChevronUp
                className={cn('h-3.5 w-3.5 transition-transform', !menuOpen && 'rotate-180')}
              />
            </span>
            <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-[#0b4f55]/85 sm:text-[13px]">
              {active.label}
            </span>
            <span className="mt-1 block text-[11px] font-medium tabular-nums text-[#0b4f55]/60">
              {target === null
                ? `${ar(count)} ${count === 1 ? 'مرة' : 'مرات'}`
                : reached
                  ? `أتممت ${ar(target)} ${target === 1 ? 'قراءة' : 'قراءات'}`
                  : `بقي ${ar(target - count)} من ${ar(target)}`}
            </span>
          </span>
        </button>

        {reached && !stepDone && onCompleteStep && (
          <button
            type="button"
            disabled={marking}
            onClick={markDone}
            className="flex h-10 shrink-0 animate-fade-in items-center gap-1.5 rounded-full bg-mint-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-mint-700 disabled:opacity-60"
          >
            <Check className="h-4 w-4" strokeWidth={3} />
            <span className="hidden min-[400px]:inline">علّم الخطوة مكتملة</span>
            <span className="min-[400px]:hidden">تمت</span>
          </button>
        )}

        {/* Tasbīḥ-style control: undo · the big bead ring · reset. */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/70 p-0.5 shadow-[inset_0_1px_2px_rgba(60,40,10,.12)] ring-1 ring-[#b08a3e]/30">
          <button
            type="button"
            onClick={() => change(-1)}
            disabled={count === 0}
            aria-label="إنقاص قراءة"
            title="إنقاص قراءة"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/8 active:bg-[#0b4f55]/12 disabled:opacity-25"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>

          {/* The one big target: tap after every reading. */}
          <button
            type="button"
            onClick={() => change(1)}
            aria-label={`عدّ قراءة — ${target ? `${count} من ${target}` : count}`}
            className={cn(
              'relative flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-full text-white transition-[background-color,transform,box-shadow] duration-150 active:scale-[.94]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0bc66] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7efd9]',
              reached
                ? 'bg-linear-to-b from-mint-500 to-mint-700 shadow-[0_4px_10px_-4px_rgba(30,116,84,.6)]'
                : 'bg-linear-to-b from-[#0e5d64] to-[#083f44] shadow-[0_4px_10px_-4px_rgba(11,79,85,.7)]',
            )}
          >
            <BeadRing count={count} target={target} reached={reached} ratio={ratio} />
            {/* A ripple per tap, so every reading is felt as counted. */}
            {bump > 0 && (
              <span
                key={bump}
                aria-hidden
                className="pointer-events-none absolute inset-0 animate-[counter-ripple_.5s_ease-out_forwards] rounded-full ring-2 ring-[#e0bc66]"
              />
            )}
            <span
              key={`n${bump}`}
              className="relative flex animate-fade-in flex-col items-center leading-none"
            >
              {reached ? (
                <Check className="h-5 w-5" strokeWidth={3} />
              ) : count === 0 ? (
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              ) : (
                <span className="font-display text-lg font-bold tabular-nums">{ar(count)}</span>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCounts((prev) => ({ ...prev, [active.step.stepKey]: 0 }))}
            disabled={count === 0}
            aria-label="تصفير العدّاد"
            title="تصفير العدّاد"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/8 active:bg-[#0b4f55]/12 disabled:opacity-25"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The ring around the counter: one bead-like segment per required reading (up to 12), lit gold
 * as they are counted — or a plain progress arc for larger targets, a soft track when
 * open-ended.
 */
function BeadRing({
  count,
  target,
  reached,
  ratio,
}: {
  count: number;
  target: number | null;
  reached: boolean;
  ratio: number;
}) {
  const R = 28;
  const C = 2 * Math.PI * R;
  const lit = reached ? '#d3f0e1' : '#e0bc66';
  return (
    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden>
      {target !== null && target > 1 && target <= 12 ? (
        Array.from({ length: target }, (_, i) => {
          const gap = 0.16;
          const seg = (2 * Math.PI) / target;
          const a0 = i * seg + gap / 2;
          const a1 = (i + 1) * seg - gap / 2;
          const p = (a: number) => `${32 + R * Math.cos(a)} ${32 + R * Math.sin(a)}`;
          return (
            <path
              key={i}
              d={`M ${p(a0)} A ${R} ${R} 0 0 1 ${p(a1)}`}
              fill="none"
              stroke={i < count ? lit : 'rgba(255,255,255,.2)'}
              strokeWidth="3.5"
              strokeLinecap="round"
              className="transition-[stroke] duration-300"
            />
          );
        })
      ) : (
        <>
          <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="3.5" />
          {target !== null && (
            <circle
              cx="32"
              cy="32"
              r={R}
              fill="none"
              stroke={lit}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - ratio)}
              className="transition-[stroke-dashoffset] duration-300"
            />
          )}
        </>
      )}
    </svg>
  );
}
