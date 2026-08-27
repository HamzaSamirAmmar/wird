import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, IconButton } from '@wird/ui-web';
import { addDays, isoWeekStart, todayISO } from '../lib/dates';

const dayFormat = new Intl.DateTimeFormat('ar', { weekday: 'short' });
const monthFormat = new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' });

/**
 * A one-week date rail. Stepping moves by a whole week; picking a day selects it.
 * Under dir="rtl" the row already runs right-to-left, so the days stay in calendar order.
 */
export function WeekStrip({
  value,
  onChange,
  /** Optional per-day count, keyed by ISO date — drawn as a dot under the day. */
  markers,
}: {
  value: string;
  onChange: (iso: string) => void;
  markers?: Record<string, number>;
}) {
  const weekStart = isoWeekStart(value);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = todayISO();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <IconButton aria-label="الأسبوع السابق" onClick={() => onChange(addDays(value, -7))}>
          <ChevronRight className="h-4.5 w-4.5" />
        </IconButton>

        <div className="text-sm font-medium text-neutral-700">
          {monthFormat.format(new Date(`${value}T00:00:00`))}
        </div>

        <IconButton aria-label="الأسبوع التالي" onClick={() => onChange(addDays(value, 7))}>
          <ChevronLeft className="h-4.5 w-4.5" />
        </IconButton>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((iso) => {
          const date = new Date(`${iso}T00:00:00`);
          const selected = iso === value;
          const count = markers?.[iso] ?? 0;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onChange(iso)}
              aria-pressed={selected}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl py-2.5 transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                selected
                  ? 'bg-primary-700 text-white shadow-glow'
                  : 'text-neutral-600 hover:bg-primary-50 hover:text-primary-800',
              )}
            >
              <span
                className={cn(
                  // The Arabic short weekday ("الخميس") is wider than a seventh of the rail.
                  'max-w-full truncate px-0.5 text-[10px]',
                  selected ? 'text-primary-100' : 'text-neutral-400',
                )}
              >
                {dayFormat.format(date)}
              </span>
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
                  !selected && iso === today && 'bg-primary-100 text-primary-800',
                )}
              >
                {date.getDate()}
              </span>
              <span
                className={cn(
                  'h-1 w-1 rounded-full',
                  count > 0 ? (selected ? 'bg-mint-300' : 'bg-mint-400') : 'bg-transparent',
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
