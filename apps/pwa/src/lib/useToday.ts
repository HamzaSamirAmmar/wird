import * as React from 'react';
import { todayISO } from './dates';

/**
 * Today's date that follows the clock: an installed PWA can sit open (or suspended in the
 * background) across midnight, and everything keyed on "today" — the selected day, the
 * leaderboard window, the streak — must move on with it rather than show yesterday until
 * a reload. Re-checks at the next local midnight and whenever the app comes back to the
 * foreground (timers do not run while a phone sleeps).
 */
export function useToday(): string {
  const [today, setToday] = React.useState(todayISO);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => setToday((prev) => (prev === todayISO() ? prev : todayISO()));
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        check();
        schedule();
      }, next.getTime() - now.getTime());
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);

  return today;
}
