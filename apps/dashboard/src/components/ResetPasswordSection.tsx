import * as React from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Alert, Button, IconButton } from '@wird/ui-web';
import { supabase } from '../lib/supabase';
import { buildResetMessage } from '../lib/welcomeMessage';

interface ResetCreds {
  fullName: string;
  username: string;
  password: string;
}

/**
 * «إعادة تعيين كلمة المرور», behind an inline confirm. Goes through the `reset-password`
 * edge function (changing someone else's auth password needs the service role), which also
 * sets must_change_password — the user signs in with the temporary password and is sent
 * straight to choosing their own. The new password is shown once, with a ready-to-send
 * message, like account creation.
 */
export function ResetPasswordSection({ userId, name }: { userId: string; name: string }) {
  const [confirming, setConfirming] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [creds, setCreds] = React.useState<ResetCreds | null>(null);
  const [copied, setCopied] = React.useState<'message' | 'password' | null>(null);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleReset() {
    setResetting(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke<ResetCreds & { error?: string }>(
      'reset-password',
      { body: { userId } },
    );
    setResetting(false);
    setConfirming(false);
    if (error || !data || data.error) {
      setError(data?.error ?? 'تعذر إعادة تعيين كلمة المرور');
      return;
    }
    setCreds({ fullName: data.fullName, username: data.username, password: data.password });
  }

  if (creds) {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-mint-50/60 p-3 ring-1 ring-mint-200">
        <Alert variant="warning" title="انسخ كلمة المرور الآن">
          لن تظهر مرة أخرى. سيُطلب من {creds.fullName} تعيين كلمة مرور جديدة عند الدخول.
        </Alert>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 ring-1 ring-neutral-200">
          <div className="min-w-0">
            <div className="text-xs text-neutral-500">كلمة المرور المؤقتة</div>
            <div dir="ltr" className="truncate font-mono text-sm font-medium text-neutral-900">
              {creds.password}
            </div>
          </div>
          <IconButton
            aria-label="نسخ كلمة المرور"
            onClick={() => {
              navigator.clipboard.writeText(creds.password);
              setCopied('password');
            }}
            className={copied === 'password' ? 'text-mint-600' : undefined}
          >
            {copied === 'password' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </IconButton>
        </div>
        <Button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(buildResetMessage(creds));
            setCopied('message');
          }}
        >
          {copied === 'message' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied === 'message' ? 'تم النسخ' : 'نسخ رسالة إعادة التعيين'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="danger">{error}</Alert>}
      {!confirming ? (
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() => setConfirming(true)}
        >
          <KeyRound className="h-4 w-4" />
          إعادة تعيين كلمة المرور
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Alert variant="info" title={`إعادة تعيين كلمة مرور ${name}؟`}>
            تتوقف كلمة المرور الحالية فوراً، وتظهر لك كلمة مرور مؤقتة لترسلها له، ثم يُطلب منه تعيين
            كلمة مرور جديدة عند الدخول.
          </Alert>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              تراجع
            </Button>
            <Button type="button" loading={resetting} onClick={handleReset}>
              نعم، أعد التعيين
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
