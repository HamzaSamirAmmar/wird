import * as React from 'react';
import { Bell, BellOff, BellRing, Download, Share, SquarePlus } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  IconButton,
  cn,
} from '@wird/ui-web';
import {
  enablePush,
  ensurePushRegistered,
  getPushState,
  pushPlatform,
  sendTestPush,
  type PushState,
} from '../lib/notifications';
import { useAuth } from '../lib/auth-context';

// ─── Install prompt (Android / desktop Chromium) ──────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Captured at module load: the event fires once, early, possibly before any component mounts.
let deferredInstall: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e as BeforeInstallPromptEvent;
  installListeners.forEach((l) => l());
});
window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  installListeners.forEach((l) => l());
});

function useInstallPrompt() {
  const [available, setAvailable] = React.useState(!!deferredInstall);
  React.useEffect(() => {
    const listener = () => setAvailable(!!deferredInstall);
    installListeners.add(listener);
    return () => {
      installListeners.delete(listener);
    };
  }, []);
  const install = React.useCallback(async () => {
    if (!deferredInstall) return;
    await deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    setAvailable(false);
  }, []);
  return { available, install };
}

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
              {(i + 1).toLocaleString('ar-EG')}.{' '}
            </span>
            {step.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ─── Settings (header bell) ───────────────────────────────────────────────────

const deniedHelp: Record<ReturnType<typeof pushPlatform>, string> = {
  ios: 'افتح الإعدادات ← الإشعارات ← ورد، ثم فعّل «السماح بالإشعارات».',
  android:
    'اضغط مطولاً على أيقونة «ورد» ← معلومات التطبيق ← الإشعارات، أو من إعدادات الموقع في المتصفح، ثم اسمح بالإشعارات.',
  desktop: 'اضغط رمز القفل بجانب عنوان الموقع، ثم اسمح بالإشعارات وأعد تحميل الصفحة.',
};

/**
 * Bell in the header: the device's notification status at a glance, and a sheet to enable,
 * test, or fix it. The test button is how an employee (or the supervisor standing next to
 * them) proves a specific phone actually receives — "I never get them" becomes checkable.
 */
export function PushSettingsButton() {
  const { profile } = useAuth();
  const { state, refresh } = usePushState();
  const install = useInstallPrompt();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );

  if (!state || state.status === 'unsupported') return null;

  const on = state.status === 'granted' && state.registered;

  async function handleEnable() {
    if (!profile) return;
    setBusy(true);
    setNotice(null);
    const { error } = await enablePush(profile.id);
    setBusy(false);
    if (error) setNotice({ tone: 'danger', text: error });
    refresh();
  }

  async function handleTest() {
    setBusy(true);
    setNotice(null);
    const { error } = await sendTestPush();
    setBusy(false);
    setNotice(
      error
        ? { tone: 'danger', text: error }
        : { tone: 'success', text: 'أُرسل — يجب أن يظهر الإشعار خلال ثوانٍ' },
    );
  }

  return (
    <>
      <IconButton
        aria-label="إعدادات الإشعارات"
        onClick={() => {
          setNotice(null);
          setOpen(true);
          refresh();
        }}
        className="relative text-primary-100 active:bg-white/10"
      >
        {on ? <Bell className="h-4.5 w-4.5" /> : <BellOff className="h-4.5 w-4.5" />}
        {!on && (
          <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-400 ring-2 ring-primary-800" />
        )}
      </IconButton>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>الإشعارات</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {notice && <Alert variant={notice.tone}>{notice.text}</Alert>}

            <div
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3',
                on ? 'bg-mint-50 text-mint-800' : 'bg-neutral-100 text-neutral-700',
              )}
            >
              {on ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
              <div className="text-sm font-medium">
                {on
                  ? 'الإشعارات مفعّلة على هذا الجهاز'
                  : state.status === 'needs-install'
                    ? 'يلزم تثبيت التطبيق أولاً'
                    : state.status === 'denied'
                      ? 'الإشعارات محظورة على هذا الجهاز'
                      : 'الإشعارات غير مفعّلة'}
              </div>
            </div>

            {state.status === 'needs-install' && <IosInstallSteps />}

            {state.status === 'denied' && (
              <p className="text-sm leading-relaxed text-neutral-600">
                {deniedHelp[pushPlatform()]}
              </p>
            )}

            {(state.status === 'prompt' || (state.status === 'granted' && !state.registered)) && (
              <Button block disabled={busy} onClick={handleEnable}>
                <BellRing className="h-4 w-4" />
                {busy ? 'جارٍ…' : 'تفعيل الإشعارات'}
              </Button>
            )}

            {on && (
              <Button block variant="outline" disabled={busy} onClick={handleTest}>
                {busy ? 'جارٍ الإرسال…' : 'إرسال إشعار تجريبي'}
              </Button>
            )}

            {install.available && (
              <Button block variant="outline" onClick={install.install}>
                <Download className="h-4 w-4" />
                تثبيت التطبيق على الجهاز
              </Button>
            )}

            <p className="text-xs leading-relaxed text-neutral-500">
              يصلك ورد اليوم داخل الإشعار نفسه، ويُحفظ على الجهاز فيفتح التطبيق عليه حتى دون اتصال
              بالإنترنت.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
