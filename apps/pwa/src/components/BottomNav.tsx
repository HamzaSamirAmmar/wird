import { NavLink } from 'react-router-dom';
import { ListChecks, Trophy } from 'lucide-react';
import { cn } from '@wird/ui-web';

const tabs = [
  { to: '/', label: 'الأورد', icon: ListChecks, end: true },
  { to: '/leaderboard', label: 'الصدارة', icon: Trophy, end: false },
];

/** Two-tab bar pinned to the bottom of the app shell, matched to the phone's max-w-md column. */
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md items-stretch border-t border-neutral-200 bg-surface/95 pb-safe backdrop-blur-md">
      {tabs.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors duration-150',
              isActive ? 'text-primary-700' : 'text-neutral-400 active:text-neutral-600',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
