import * as React from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { changeOwnPassword } from '@wird/supabase-client';
import { changePasswordSchema } from '@wird/domain';
import { Alert, Button, Field, Input } from '@wird/ui-web';
import { AuthShell } from '../components/AuthShell';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';

export default function ChangePassword() {
  const { profile, refreshProfile } = useAuth();
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  if (profile && !profile.mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = changePasswordSchema.safeParse({ newPassword, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'خطأ في البيانات');
      return;
    }

    setSubmitting(true);
    const { error } = await changeOwnPassword(supabase, newPassword);
    setSubmitting(false);

    if (error) {
      setError('تعذر تغيير كلمة المرور، حاول مرة أخرى');
      return;
    }
    await refreshProfile();
  }

  return (
    <AuthShell title="تغيير كلمة المرور" description="يجب تعيين كلمة مرور جديدة قبل المتابعة">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

        <Field label="كلمة المرور الجديدة" htmlFor="new-password" hint="٨ أحرف على الأقل">
          <Input
            id="new-password"
            type="password"
            dir="ltr"
            icon={<KeyRound className="h-4 w-4" />}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <Field label="تأكيد كلمة المرور" htmlFor="confirm-password">
          <Input
            id="confirm-password"
            type="password"
            dir="ltr"
            icon={<KeyRound className="h-4 w-4" />}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <Button type="submit" size="lg" block loading={submitting} className="mt-2">
          حفظ كلمة المرور
        </Button>
      </form>
    </AuthShell>
  );
}
