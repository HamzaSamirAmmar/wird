import * as React from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound, User } from 'lucide-react';
import { Alert, Button, Field, Input } from '@wird/ui-web';
import { AuthShell } from '../components/AuthShell';
import { useAuth } from '../lib/auth-context';

export default function Login() {
  const { session, profile, signIn, loading } = useAuth();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  if (!loading && session && profile) {
    if (profile.role !== 'supervisor') {
      return <Navigate to="/unauthorized" replace />;
    }
    if (profile.mustChangePassword) {
      return <Navigate to="/change-password" replace />;
    }
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(username, password);
    setSubmitting(false);
    if (error) setError(error);
  }

  return (
    <AuthShell title="تسجيل الدخول" description="ادخل ببيانات المشرف لإدارة المجموعات والأورد">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

        <Field label="اسم المستخدم" htmlFor="username">
          <Input
            id="username"
            dir="ltr"
            icon={<User className="h-4 w-4" />}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>

        <Field label="كلمة المرور" htmlFor="password">
          <Input
            id="password"
            type="password"
            dir="ltr"
            icon={<KeyRound className="h-4 w-4" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <Button type="submit" size="lg" block loading={submitting} className="mt-2">
          تسجيل الدخول
        </Button>
      </form>
    </AuthShell>
  );
}
