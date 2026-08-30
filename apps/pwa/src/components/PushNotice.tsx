import * as React from 'react';
import { BellRing } from 'lucide-react';
import { Button, cn } from '@wird/ui-web';
import { enablePush, getPushState, type PushState } from '../lib/notifications';
import { useAuth } from '../lib/auth-context';

/**
 * One-line card on the home screen asking to enable push. Shown while permission hasn't been
 * decided — the OS prompt must originate from a tap (an iOS requirement), so this is never
 * requested automatically on first load — and also when permission is granted but this device
 * still has no row in fcm_tokens, which is otherwise a silent dead end: the card is the only
 * way back, and without it a device that failed to register once never registers again.
 */
export function PushNotice() {
  const { profile } = useAuth();
  const [state, setState] = React.useState<PushState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  const refresh = React.useCallback(() => {
    getPushState().then(setState);
  }, []);

  React.useEffect(refresh, [refresh]);

  async function handleEnable() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    const { error } = await enablePush(profile.id);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    refresh();
  }

  const needsRegistration = state?.status === 'granted' && !state.registered;
  if (dismissed || (state?.status !== 'prompt' && !needsRegistration)) return null;

  return (
    <div
      className={cn(
        'mb-3 flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
        <BellRing className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-neutral-900">تفعيل الإشعارات</div>
        <div className="text-xs leading-relaxed text-neutral-600">
          {error ??
            (needsRegistration
              ? 'لم يُسجَّل هذا الجهاز بعد — أعد المحاولة لتصلك التذكيرات'
              : 'تذكيرات وردك اليومي تصلك حتى مع إغلاق التطبيق')}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => setDismissed(true)}
          className="rounded-lg px-2 py-1 text-xs text-neutral-400 hover:text-neutral-600"
        >
          لاحقاً
        </button>
        <Button size="sm" disabled={busy} onClick={handleEnable}>
          {busy ? 'جارٍ…' : needsRegistration ? 'إعادة المحاولة' : 'تفعيل'}
        </Button>
      </div>
    </div>
  );
}
