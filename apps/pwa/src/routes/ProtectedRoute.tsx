import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from '@wird/ui-web';
import { useAuth } from '../lib/auth-context';

export default function ProtectedRoute() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!session || !profile) return <Navigate to="/login" replace />;
  if (profile.mustChangePassword) return <Navigate to="/change-password" replace />;

  return <Outlet />;
}
