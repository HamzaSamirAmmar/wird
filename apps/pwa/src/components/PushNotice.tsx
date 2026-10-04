import * as React from 'react';
import { BellRing, Share, SquarePlus } from 'lucide-react';
import { Button, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@wird/ui-web';
import { enablePush, ensurePushRegistered, getPushState, type PushState } from '../lib/notifications';
import { useAuth } from '../lib/auth-context';

// ─── Shared state ─────────────────────────────────────────────────────────────

function usePushState() {
  const { profile } = useAuth();
  const [state, setState] = React.useState<PushState | null>(null);

  const refresh = React.useCallback(async () => {
    // Re-register first: an already-granted device that has not registered on the current
    // worker yet (every device right after the worker migration) should show as "on", not as
    // "failed, retry".
    if (profile) await ensurePushRegistered(profile.id);
    setState(await getPushState());
  }, [profile]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return { state, refresh };
}

// ─── Home-screen card ─────────────────────────────────────────────────────────

/**
 * One-line card on the home screen, shown only when there is something the employee should do:
 * install the app (iPhone — web push only works from the home screen), allow notifications, or
 * retry a registration that failed. The OS permission prompt must originate from a tap (an iOS
 * requirement), so it is never requested automatically.
 */
export function PushNotice() {
  const { profile } = useAuth();
  const { state, refresh } = usePushState();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const [showInstallHelp, setShowInstallHelp] = React.useState(false);

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

  if (dismissed || !state) return null;

  const needsRegistration = state.status === 'granted' && !state.registered;
  const needsInstall = state.status === 'needs-install';
  if (state.status !== 'prompt' && !needsRegistration && !needsInstall) return null;

  return (
    <>
      <div className="mb-3 flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          {needsInstall ? (
            <SquarePlus className="h-4.5 w-4.5" />
          ) : (
            <BellRing className="h-4.5 w-4.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-neutral-900">
            {needsInstall ? 'أضف التطبيق إلى الشاشة الرئيسية' : 'تفعيل الإشعارات'}
          </div>
          <div className="text-xs leading-relaxed text-neutral-600">
            {error ??
              (needsInstall
                ? 'على الآيفون لا تصل التذكيرات إلا بعد تثبيت التطبيق'
                : needsRegistration
                  ? 'لم يُسجَّل هذا الجهاز بعد — أعد المحاولة لتصلك التذكيرات'
                  : 'ورد اليوم يصلك في الإشعار ويفتح مباشرة حتى دون إنترنت')}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg px-2 py-1 text-xs text-neutral-400 hover:text-neutral-600"
          >
            لاحقاً
          </button>
          {needsInstall ? (
            <Button size="sm" onClick={() => setShowInstallHelp(true)}>
              كيف؟
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={handleEnable}>
              {busy ? 'جارٍ…' : needsRegistration ? 'إعادة المحاولة' : 'تفعيل'}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={showInstallHelp} onOpenChange={setShowInstallHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تثبيت التطبيق على الآيفون</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <IosInstallSteps />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

function IosInstallSteps() {
  const steps = [
    {
      icon: Share,
      text: 'افتح التطبيق في Safari واضغط زر المشاركة أسفل الشاشة',
    },
    { icon: SquarePlus, text: 'اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة»' },
    { icon: BellRing, text: 'افتح «ورد» من أيقونته على الشاشة الرئيسية وفعّل الإشعارات' },
  ];
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
            <step.icon className="h-4 w-4" />
          </span>
          <span className="pt-1.5 text-sm leading-relaxed text-neutral-700">
            <span className="font-semibold text-primary-800">
              {(i + 1).toLocaleString('ar-u-nu-latn')}.{' '}
            </span>
            {step.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
