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

async function currentToken(): Promise<string | null> {
  if (!pushConfigured()) return null;
  try {
    return await getToken(messagingInstance(), {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });
  } catch {
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
  await supabase.from('fcm_tokens').upsert(
    { token, profile_id: profileId },
    { onConflict: 'token' },
  );
}

/** Request permission + register this device's token against the logged-in profile. */
export async function enablePush(profileId: string): Promise<{ error: string | null }> {
  if (!pushConfigured()) return { error: 'الإشعارات غير مهيأة بعد' };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { error: 'لم يتم السماح بالإشعارات' };

    const token = await currentToken();
    if (!token) return { error: 'تعذر تسجيل الجهاز للإشعارات' };

    const { error } = await supabase
      .from('fcm_tokens')
      .upsert({ token, profile_id: profileId }, { onConflict: 'token' });
    if (error) return { error: 'تعذر حفظ إعدادات الإشعارات' };
    return { error: null };
  } catch {
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
