// Push-notification registration for the employee PWA.
//
// Flow: (user gesture) → Notification.requestPermission() → FCM getToken(vapid) →
// upsert into public.fcm_tokens. The firebase-messaging-sw.js at
// /firebase-cloud-messaging-push-scope handles delivery while the app is closed.
//
// firebaseConfig is public by design (it identifies the project, it is not a secret);
// the VAPID key is likewise public — it only has to stay the same forever.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { supabase } from './supabase';

const firebaseConfig = {
  apiKey: 'AIzaSyDntl1C3n2UtNC5cjYLO1OjbQaIz43sNNc',
  authDomain: 'wird-dhikr.firebaseapp.com',
  projectId: 'wird-dhikr',
  storageBucket: 'wird-dhikr.firebasestorage.app',
  messagingSenderId: '102858254897',
  appId: '1:102858254897:web:94bfa8771385ccb76c8310',
};

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

export type PushState =
  | { status: 'unsupported' }
  | { status: 'prompt' }
  | { status: 'granted'; registered: boolean }
  | { status: 'denied' };

export async function getPushState(): Promise<PushState> {
  // Until the VAPID key is configured the whole feature stays hidden, not broken.
  if (!pushConfigured()) return { status: 'unsupported' };
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    return { status: 'unsupported' };
  }
  const permission = Notification.permission;
  if (permission === 'denied') return { status: 'denied' };
  if (permission !== 'granted') return { status: 'prompt' };
  return { status: 'granted', registered: !!(await currentToken()) };
}

function messagingInstance() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getMessaging(app);
}

/**
 * Registers the FCM worker explicitly rather than relying on the SDK's implicit registration.
 * The implicit path gives no say over when the worker is ready, and getToken() rejects if it
 * is asked before one is active — which on a cold load competes with the Workbox worker at '/'
 * registering at the same moment. Doing it here makes the ordering ours and the failure legible.
 */
async function fcmRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/firebase-cloud-messaging-push-scope',
  });
  // register() resolves as soon as the worker is installing; getToken needs it activated.
  if (!registration.active) {
    await new Promise<void>((resolve) => {
      const worker = registration.installing ?? registration.waiting;
      if (!worker) return resolve();
      worker.addEventListener('statechange', function onChange() {
        if (worker.state === 'activated') {
          worker.removeEventListener('statechange', onChange);
          resolve();
        }
      });
    });
  }
  return registration;
}

/** Throws with the underlying reason — callers decide what to show. */
async function requestToken(): Promise<string> {
  const token = await getToken(messagingInstance(), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: await fcmRegistration(),
  });
  if (!token) throw new Error('FCM returned an empty token');
  return token;
}

async function currentToken(): Promise<string | null> {
  if (!pushConfigured()) return null;
  try {
    return await requestToken();
  } catch (e) {
    // Not fatal on the silent path (app open), but never invisible: a wrong VAPID key or a
    // blocked worker used to look identical to "push simply isn't on".
    console.error('[wird/push] token request failed:', e);
    return null;
  }
}

/**
 * Idempotent re-registration on app open. Covers token rotation without listening for
 * refresh events (firebase v12 removed onTokenRefresh in favour of a new register API —
 * a plain upsert on launch is simpler and equally correct).
 */
export async function ensurePushRegistered(profileId: string) {
  if (!pushConfigured() || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  const token = await currentToken();
  if (!token) return;
  const { error } = await supabase
    .from('fcm_tokens')
    .upsert(
      { token, profile_id: profileId, last_seen_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
  if (error) console.error('[wird/push] token upsert failed:', error.message);
}

/** Request permission + register this device's token against the logged-in profile. */
export async function enablePush(profileId: string): Promise<{ error: string | null }> {
  if (!pushConfigured()) return { error: 'الإشعارات غير مهيأة بعد' };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { error: 'لم يتم السماح بالإشعارات' };

    // Deliberately requestToken() and not currentToken(): on the button path the reason a
    // device could not register has to reach the console, not be swallowed into a null.
    const token = await requestToken();

    const { error } = await supabase
      .from('fcm_tokens')
      .upsert(
        { token, profile_id: profileId, last_seen_at: new Date().toISOString() },
        { onConflict: 'token' },
      );
    if (error) {
      console.error('[wird/push] token upsert failed:', error.message);
      return { error: 'تعذر حفظ إعدادات الإشعارات' };
    }
    return { error: null };
  } catch (e) {
    console.error('[wird/push] enablePush failed:', e);
    return { error: 'تعذر تفعيل الإشعارات على هذا الجهاز' };
  }
}

/** In-app (foreground) delivery, registered once on the home screen. */
export function listenForForegroundNotifications() {
  if (!pushConfigured() || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  // FCM only auto-shows a notification when the page is hidden.
  onMessage(messagingInstance(), async (payload) => {
    const title = payload.notification?.title ?? 'ورد';
    const body = payload.notification?.body ?? '';
    const registration = await navigator.serviceWorker.getRegistration(
      '/firebase-cloud-messaging-push-scope',
    );
    if (registration) {
      await registration.showNotification(title, {
        body,
        dir: 'rtl',
        lang: 'ar',
        icon: '/icon-192.png',
        tag: 'wird',
      });
    }
  });
}
