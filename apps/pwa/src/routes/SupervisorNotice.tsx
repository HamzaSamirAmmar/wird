import { Monitor } from 'lucide-react';
import { Button } from '@wird/ui-web';
import { AuthShell } from '../components/AuthShell';
import { useAuth } from '../lib/auth-context';

export default function SupervisorNotice() {
  const { signOut } = useAuth();
  return (
    <AuthShell
      title="هذا التطبيق للموظفين"
      description="لإدارة المجموعات والموظفين وإسناد الأورد، استخدم لوحة التحكم من المتصفح."
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-4 ring-1 ring-primary-100">
          <Monitor className="h-5 w-5 shrink-0 text-primary-600" />
          <p className="text-sm text-primary-900">صلاحية الحساب الحالي: مشرف</p>
        </div>
        <Button variant="outline" size="lg" block onClick={() => signOut()}>
          تسجيل الخروج
        </Button>
      </div>
    </AuthShell>
  );
}
