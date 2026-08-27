import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Users, UsersRound, CalendarDays, LogOut, Menu, X } from 'lucide-react';
import { cn, WirdMark, Avatar, IconButton } from '@wird/ui-web';
import { useAuth } from '../lib/auth-context';

const navItems = [
  { to: '/', label: 'الأورد', icon: CalendarDays, end: true },
  { to: '/groups', label: 'المجموعات', icon: UsersRound },
  { to: '/employees', label: 'الموظفون', icon: Users },
];

export default function DashboardLayout() {
  const { profile, signOut } = useAuth();
  const [navOpen, setNavOpen] = React.useState(false);
  const { pathname } = useLocation();

  // The sidebar is a slide-over below `lg`; navigating inside it should dismiss it.
  React.useEffect(() => setNavOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen bg-canvas">
      {navOpen && (
        <button
          aria-label="إغلاق القائمة"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-primary-950/40 backdrop-blur-[2px] animate-fade-in lg:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 z-40 flex w-64 shrink-0 flex-col overflow-hidden bg-linear-to-b from-primary-800 to-primary-950 text-primary-100',
          'transition-transform duration-300 ease-(--ease-out-soft) lg:static lg:translate-x-0',
          // dir="rtl": the drawer lives on the right, so it hides by moving further right.
          navOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className="mihrab-pattern pointer-events-none absolute inset-0 opacity-70" />

        <div className="relative flex items-center justify-between gap-3 px-5 pb-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
              <WirdMark className="h-6 w-6" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-xl font-medium text-white">ورد</div>
              <div className="text-[11px] text-primary-200/80">لوحة التحكم</div>
            </div>
          </div>
          <IconButton
            aria-label="إغلاق القائمة"
            onClick={() => setNavOpen(false)}
            className="text-primary-200 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        <nav className="relative flex flex-1 flex-col gap-1 px-3">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                  'text-primary-100/80 transition-colors duration-150 hover:bg-white/10 hover:text-white',
                  isActive && 'bg-white/12 text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active marker on the leading (right, in RTL) edge. */}
                  <span
                    className={cn(
                      'absolute inset-y-1.5 -start-3 w-1 rounded-full bg-mint-300 transition-opacity duration-150',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <Icon className="h-4.5 w-4.5" />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="relative m-3 rounded-xl bg-white/8 p-3 ring-1 ring-white/10">
          <div className="flex items-center gap-3">
            <Avatar name={profile?.fullName ?? '—'} size="sm" className="bg-white/15 text-white" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{profile?.fullName}</div>
              <div className="text-[11px] text-primary-200/70">مشرف</div>
            </div>
            <IconButton
              aria-label="تسجيل الخروج"
              onClick={() => signOut()}
              className="text-primary-200 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-neutral-200/80 bg-surface/80 px-4 py-3 backdrop-blur-md lg:hidden">
          <IconButton aria-label="فتح القائمة" onClick={() => setNavOpen(true)}>
            <Menu className="h-5 w-5" />
          </IconButton>
          <div className="flex items-center gap-2 font-display text-lg text-neutral-900">
            <WirdMark className="h-5 w-5 text-primary-700" />
            ورد
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
