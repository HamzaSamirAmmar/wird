import { Navigate, Outlet } from 'react-router-dom';
import { WirdMark } from '@wird/ui-web';
import { useAuth } from '../lib/auth-context';

/** Brand-coloured splash while the session is being restored — no bare spinner on a blank page. */
function AuthSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas">
      <WirdMark className="h-12 w-12 animate-pulse text-primary-700" />
      <span className="text-sm text-neutral-400">جارٍ التحميل…</span>
    </div>
  );
}

export default function ProtectedRoute() {
  const { session, profile, loading } = useAuth();

  if (loading) return <AuthSplash />;

  if (!session || !profile) return <Navigate to="/login" replace />;
  if (profile.mustChangePassword) return <Navigate to="/change-password" replace />;

  return <Outlet />;
}
