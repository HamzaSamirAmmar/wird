// Push-notification registration for the employee PWA.
//
// Flow: (user gesture) → Notification.requestPermission() → FCM getToken(vapid, the app's own
// service worker) → register_push_token RPC (one token per device, owned by whoever is signed
// in). Delivery and display are entirely src/sw.ts — there is no foreground display path in the
// page, so a push can never be shown twice by two open windows.
//
// firebaseConfig is public by design (it identifies the project, it is not a secret);
// the VAPID key is likewise public — it only has to stay the same forever.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';
import { supabase } from './supabase';
import { deleteMeta, getDeviceId, getMetaJSON, setMetaJSON } from './offline';

const firebaseConfig = {
  apiKey: 'AIzaSyDntl1C3n2UtNC5cjYLO1OjbQaIz43sNNc',
  authDomain: 'wird-dhikr.firebaseapp.com',
  projectId: 'wird-dhikr',
  storageBucket: 'wird-dhikr.firebasestorage.app',
  messagingSenderId: '102858254897',
  appId: '1:102858254897:web:94bfa8771385ccb76c8310',
};

// Where the old hand-written FCM worker lived. Push now goes through the app's own worker at
// '/', and the old registration is removed once this device has a token on the new one.
const LEGACY_FCM_SCOPE = '/firebase-cloud-messaging-push-scope';

export function pushConfigured(): boolean {
  return !!import.meta.env.VITE_FIREBASE_VAPID_KEY;
}

// The UI degrades to silence when the VAPID key is missing (deliberate — see AGENTS.md), but
// silence in the console too is what let a hosted build ship with push entirely absent and no
// way to tell. VITE_ vars are inlined at build time, so this fires when the *build* env lacked
// the key, not the runtime one.
if (!pushConfigured()) {
  console.warn(
    '[wird/push] VITE_FIREBASE_VAPID_KEY was not set at build time — push notifications are ' +
      'disabled and the enable card is hidden. Set it in the build environment and redeploy.',
  );
}

// ─── Platform ─────────────────────────────────────────────────────────────────

export type PushPlatform = 'ios' | 'android' | 'desktop';

export function pushPlatform(): PushPlatform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// ─── State ────────────────────────────────────────────────────────────────────

export type PushState =
  | { status: 'unsupported' }
  // iOS only delivers web push to apps added to the home screen.
  | { status: 'needs-install' }
  | { status: 'prompt' }
  | { status: 'granted'; registered: boolean }
  | { status: 'denied' };

export async function getPushState(): Promise<PushState> {
  // Until the VAPID key is configured the whole feature stays hidden, not broken.
  if (!pushConfigured()) return { status: 'unsupported' };
  if (pushPlatform() === 'ios' && !isStandalone()) return { status: 'needs-install' };
  if (
    !('serviceWorker' in navigator) ||
    !('Notification' in window) ||
    !('PushManager' in window)
  ) {
    return { status: 'unsupported' };
  }
  const permission = Notification.permission;
  if (permission === 'denied') return { status: 'denied' };
  if (permission !== 'granted') return { status: 'prompt' };
  const saved = await getMetaJSON<SavedRegistration>(REGISTRATION_KEY);
  return { status: 'granted', registered: !!saved };
}

// ─── Token ────────────────────────────────────────────────────────────────────

function messagingInstance() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getMessaging(app);
}

/**
 * The app's own service worker (src/sw.ts). It is also the push handler, so the FCM token has
 * to be minted against *this* registration. Bounded wait: in dev, or when the worker failed
 * to install, `ready` never resolves and the caller would hang forever.
 */
async function appRegistration(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('service worker not ready')), 10_000),
    ),
  ]);
}

/** Throws with the underlying reason — callers decide what to show. */
async function requestToken(): Promise<string> {
  const token = await getToken(messagingInstance(), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: await appRegistration(),
  });
  if (!token) throw new Error('FCM returned an empty token');
  return token;
}

interface SavedRegistration {
  token: string;
  profileId: string;
  at: number;
}

const REGISTRATION_KEY = 'pushRegistration';
// Re-announce an unchanged token at most this often; last_seen_at only feeds the 60-day prune.
const REREGISTER_AFTER_MS = 12 * 60 * 60 * 1000;

async function registerToken(token: string, profileId: string): Promise<boolean> {
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_device_id: await getDeviceId(),
    p_platform: pushPlatform(),
    p_standalone: isStandalone(),
    p_user_agent: navigator.userAgent,
  });
  if (error) {
    console.error('[wird/push] token registration failed:', error.message);
    return false;
  }
  await setMetaJSON(REGISTRATION_KEY, {
    token,
    profileId,
    at: Date.now(),
  } satisfies SavedRegistration);
  await removeLegacyWorker();
  return true;
}

/** The pre-merge FCM worker kept its own push subscription; once replaced, it must go. */
async function removeLegacyWorker() {
  try {
    // getRegistration() returns the closest *enclosing* scope, which is the app's own '/'
    // worker once the legacy one is gone — check the path before unregistering anything.
    const legacy = await navigator.serviceWorker.getRegistration(LEGACY_FCM_SCOPE);
    if (legacy && new URL(legacy.scope).pathname.startsWith(LEGACY_FCM_SCOPE)) {
      await legacy.unregister();
    }
  } catch {
    /* ignore */
  }
}

/**
 * Idempotent re-registration on app open / return to foreground. Covers token rotation and an
 * account switch on the same phone without listening for refresh events (firebase v12 removed
 * onTokenRefresh — checking on launch is simpler and equally correct).
 */
let ensuring: Promise<void> | null = null;

export function ensurePushRegistered(profileId: string): Promise<void> {
  // Several callers ask on the same app open (home screen, header bell, card); one check.
  ensuring ??= doEnsurePushRegistered(profileId).finally(() => {
    ensuring = null;
  });
  return ensuring;
}

async function doEnsurePushRegistered(profileId: string) {
  if (!pushConfigured() || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted' || !navigator.onLine) return;
  try {
    const token = await requestToken();
    const saved = await getMetaJSON<SavedRegistration>(REGISTRATION_KEY);
    const fresh =
      saved &&
      saved.token === token &&
      saved.profileId === profileId &&
      Date.now() - saved.at < REREGISTER_AFTER_MS;
    if (!fresh) await registerToken(token, profileId);
  } catch (e) {
    // Not fatal on the silent path, but never invisible: a wrong VAPID key or a blocked worker
    // used to look identical to "push simply isn't on".
    console.error('[wird/push] token refresh failed:', e);
  }
}

/** Request permission + register this device's token against the logged-in profile. */
export async function enablePush(profileId: string): Promise<{ error: string | null }> {
  if (!pushConfigured()) return { error: 'الإشعارات غير مهيأة بعد' };
  if (!navigator.onLine) return { error: 'يلزم الاتصال بالإنترنت لتفعيل الإشعارات' };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { error: 'لم يتم السماح بالإشعارات' };

    // requestToken, not the silent path: on the button the reason a device could not
    // register has to reach the console, not be swallowed.
    const token = await requestToken();
    if (!(await registerToken(token, profileId))) {
      return { error: 'تعذر حفظ إعدادات الإشعارات' };
    }
    return { error: null };
  } catch (e) {
    console.error('[wird/push] enablePush failed:', e);
    return { error: 'تعذر تفعيل الإشعارات على هذا الجهاز' };
  }
}

/** Sign-out: this device stops receiving the account's pushes. Best effort, never throws. */
export async function unregisterPushDevice() {
  const saved = await getMetaJSON<SavedRegistration>(REGISTRATION_KEY);
  await deleteMeta(REGISTRATION_KEY);
  if (!saved || !pushConfigured() || !navigator.onLine) return;
  try {
    // Server side only. firebase's deleteToken() is deliberately not called: without the
    // legacy worker it registers the default /firebase-messaging-sw.js again. The browser's
    // subscription can stay — with no row in fcm_tokens nothing is sent to it, and the next
    // account to sign in here re-registers the same subscription under its own name.
    await supabase.rpc('unregister_push_device', { p_device_id: await getDeviceId() });
  } catch {
    // Offline or already gone — the next account to sign in here replaces the row anyway,
    // since register_push_token keeps one token per device.
  }
}

/** Sends a test notification to this account's own devices (edge function, `auto: test`). */
export async function sendTestPush(): Promise<{ error: string | null; sent: number }> {
  const { data, error } = await supabase.functions.invoke<{ sent?: number }>('push-notifications', {
    body: { auto: { kind: 'test' } },
  });
  if (error) return { error: 'تعذر إرسال الإشعار التجريبي', sent: 0 };
  const sent = data?.sent ?? 0;
  if (sent === 0) return { error: 'لم يُعثر على جهاز مسجّل لهذا الحساب', sent };
  return { error: null, sent };
}
