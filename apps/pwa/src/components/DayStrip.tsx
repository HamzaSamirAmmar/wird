import { addDays, isoWeekStart, todayISO } from '../lib/dates';
import { cn } from '@wird/ui-web';

const dayFormat = new Intl.DateTimeFormat('ar', { weekday: 'narrow' });

/** Compact week rail, drawn on the teal header. */
export function DayStrip({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const weekStart = isoWeekStart(value);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = todayISO();

  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((iso) => {
        const date = new Date(`${iso}T00:00:00`);
        const selected = iso === value;
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onChange(iso)}
            aria-pressed={selected}
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl py-2 transition-colors duration-150',
              selected ? 'bg-white text-primary-800' : 'text-primary-100/70 active:bg-white/10',
            )}
          >
            <span className="text-[10px]">{dayFormat.format(date)}</span>
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
                !selected && iso === today && 'bg-white/15 text-white',
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
