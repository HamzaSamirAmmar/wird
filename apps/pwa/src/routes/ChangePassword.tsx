import * as React from 'react';
import { Navigate } from 'react-router-dom';
import { changeOwnPassword } from '@wird/supabase-client';
import { changePasswordSchema } from '@wird/domain';
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription, Alert } from '@wird/ui-web';
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
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>تغيير كلمة المرور</CardTitle>
          <CardDescription>يجب تعيين كلمة مرور جديدة قبل المتابعة</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && <Alert variant="danger">{error}</Alert>}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? 'جاري الحفظ...' : 'حفظ كلمة المرور'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
