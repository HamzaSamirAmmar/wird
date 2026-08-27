import { ShieldAlert } from 'lucide-react';
import { Button } from '@wird/ui-web';
import { AuthShell } from '../components/AuthShell';
import { useAuth } from '../lib/auth-context';

export default function Unauthorized() {
  const { signOut } = useAuth();
  return (
    <AuthShell
      title="هذه اللوحة للمشرفين فقط"
      description="حسابك لا يملك صلاحية الدخول إلى لوحة التحكم. إن كنت موظفاً، استخدم تطبيق ورد على هاتفك."
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-xl bg-accent-50 p-4 ring-1 ring-accent-200">
          <ShieldAlert className="h-5 w-5 shrink-0 text-accent-600" />
          <p className="text-sm text-accent-900">صلاحية الحساب الحالي: موظف</p>
        </div>
        <Button variant="outline" size="lg" block onClick={() => signOut()}>
          تسجيل الخروج
        </Button>
      </div>
    </AuthShell>
  );
}
