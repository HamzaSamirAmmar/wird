import { Button } from '@wird/ui-web';
import { useAuth } from '../lib/auth-context';

export default function Unauthorized() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-lg font-medium text-neutral-800">
        هذه اللوحة مخصصة للمشرفين فقط
      </p>
      <Button variant="outline" onClick={() => signOut()}>
        تسجيل الخروج
      </Button>
    </div>
  );
}
