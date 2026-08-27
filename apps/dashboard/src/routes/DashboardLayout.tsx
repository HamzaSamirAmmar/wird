import { NavLink, Outlet } from 'react-router-dom';
import { Users, UsersRound, CalendarDays, LogOut } from 'lucide-react';
import { cn } from '@wird/ui-web';
import { useAuth } from '../lib/auth-context';

const navItems = [
  { to: '/', label: 'الأورد', icon: CalendarDays, end: true },
  { to: '/groups', label: 'المجموعات', icon: UsersRound },
  { to: '/employees', label: 'الموظفون', icon: Users },
];

export default function DashboardLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="flex w-60 shrink-0 flex-col border-e border-neutral-200 bg-white p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-700 text-lg font-bold text-white">
            و
          </div>
          <span className="text-lg font-semibold text-neutral-900">ورد</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100',
                  isActive && 'bg-primary-50 text-primary-800',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-neutral-200 pt-3">
          <div className="mb-2 px-2 text-sm text-neutral-500">{profile?.fullName}</div>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
