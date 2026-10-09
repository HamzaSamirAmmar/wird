import * as React from 'react';
import { HISTORY_DAYS, addDays } from '../lib/dates';
import { cn } from '@wird/ui-web';

const dayFormat = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'narrow' });
const monthFormat = new Intl.DateTimeFormat('ar-u-nu-latn', { month: 'short' });

/**
 * Scrollable day rail, drawn on the teal header.
 *
 * Was a Saturday-first week grid that could page into the future. Employees may now only look
 * backwards — today is always the newest day — so a fixed seven-cell grid no longer fits: the
 * range is HISTORY_DAYS + 1 days ending today.
 *
 * The rail is explicitly `dir="ltr"` inside an otherwise RTL app, which puts today at the far
 * LEFT and walks backwards to the right. Dates are the one strip here that reads as a number
 * line rather than as prose, and left-anchoring keeps the newest day in a fixed spot instead of
 * having it sit at whichever edge the surrounding direction happens to start from. It also
 * makes scrollLeft = 0 mean "today", which is what the reset below relies on.
 */
export function DayStrip({
  value,
  today,
  onChange,
}: {
  value: string;
  today: string;
  onChange: (iso: string) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Newest first: index 0 is today, index HISTORY_DAYS is the oldest visible day.
  const days = React.useMemo(
    () => Array.from({ length: HISTORY_DAYS + 1 }, (_, i) => addDays(today, -i)),
    [today],
  );

  // Keep the selected day in view: back to the start for today (the "العودة إلى اليوم"
  // button), and onto an older day when the page opens on it (back from the reader, a
  // notification link) — otherwise the highlight sits off-screen.
  const first = React.useRef(true);
  React.useEffect(() => {
    const rail = scrollRef.current;
    if (!rail) return;
    const behavior: ScrollBehavior = first.current ? 'instant' : 'smooth';
    first.current = false;
    if (value === today) {
      rail.scrollTo({ left: 0, behavior });
      return;
    }
    const cell = rail.querySelector<HTMLElement>(`[data-day="${value}"]`);
    if (!cell) return;
    const left = cell.offsetLeft - rail.clientWidth / 2 + cell.clientWidth / 2;
    rail.scrollTo({ left: Math.max(0, left), behavior });
  }, [value, today]);

  return (
    <div
      ref={scrollRef}
      dir="ltr"
      className={cn(
        'flex gap-1 overflow-x-auto pb-1',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {days.map((iso) => {
        const date = new Date(`${iso}T00:00:00`);
        const selected = iso === value;
        const isToday = iso === today;
        const firstOfMonth = date.getDate() === 1;

        return (
          <button
            key={iso}
            type="button"
            onClick={() => onChange(iso)}
            aria-pressed={selected}
            aria-label={iso}
            data-day={iso}
            className={cn(
              'flex w-11 shrink-0 flex-col items-center gap-1 rounded-xl py-2 transition-colors duration-150',
              selected ? 'bg-white text-primary-800' : 'text-primary-100/70 active:bg-white/10',
            )}
          >
            <span className="text-[10px]">
              {/* A month tick keeps a 31-day rail legible — without it the numbers wrap past
                  the 1st with nothing to say which month you have scrolled into. */}
              {firstOfMonth ? monthFormat.format(date) : dayFormat.format(date)}
            </span>
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
                !selected && isToday && 'bg-white/15 text-white',
              )}
            >
              {date.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
