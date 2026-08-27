import { Button } from '@wird/ui-web';
import { useAuth } from '../lib/auth-context';

export default function SupervisorNotice() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-700 text-2xl font-bold text-white">
        و
      </div>
      <p className="max-w-xs text-neutral-700">
        حسابك حساب مشرف. لإدارة المجموعات والموظفين وإسناد الأورد، الرجاء استخدام لوحة التحكم من المتصفح.
      </p>
      <Button variant="outline" onClick={() => signOut()}>
        تسجيل الخروج
      </Button>
    </div>
  );
}
