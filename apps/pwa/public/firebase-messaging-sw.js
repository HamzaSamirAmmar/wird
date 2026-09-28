// LEGACY push worker — kept only for devices that have not opened the app since push moved
// into the app's own service worker (src/sw.ts).
//
// Those devices still hold a token minted against this worker's registration
// (scope /firebase-cloud-messaging-push-scope). The next app open registers a token on the new
// worker, register_push_token() replaces this device's old row, and the app unregisters this
// worker. Until then it must keep displaying pushes — correctly — which the old FCM-SDK version
// did not always do (it never returned the showNotification promise, so iOS counted pushes as
// silent and revoked the subscription).
//
// No Firebase SDK, no CDN import: a raw push handler. Do not add features here; add them to
// src/sw.ts. Delete this file once fcm_tokens has no rows left without a device_id.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    const json = event.data ? event.data.json() : {};
    data = (json && json.data) || json || {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'ورد', {
      body: data.body || '',
      dir: 'rtl',
      lang: 'ar',
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      tag: data.tag || 'wird',
      data: { link: data.link || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(link);
    })(),
  );
});
