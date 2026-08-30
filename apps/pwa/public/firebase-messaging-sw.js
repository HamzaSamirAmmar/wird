// Firebase Cloud Messaging service worker.
//
// Deliberately a hand-written static file (not bundled): the FCM SDK registers it at the
// dedicated scope '/firebase-cloud-messaging-push-scope', which is what lets it coexist
// with the Workbox app service worker at '/' (only one worker may control a given scope).
// Version must stay in sync with the `firebase` npm package used by the app.

importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDntl1C3n2UtNC5cjYLO1OjbQaIz43sNNc',
  authDomain: 'wird-dhikr.firebaseapp.com',
  projectId: 'wird-dhikr',
  storageBucket: 'wird-dhikr.firebasestorage.app',
  messagingSenderId: '102858254897',
  appId: '1:102858254897:web:94bfa8771385ccb76c8310',
});

const messaging = firebase.messaging();

// Push arrives while the app is closed/backgrounded → raise a system notification.
//
// The server sends DATA-ONLY messages on purpose. A `notification` payload would make FCM's
// own handler display the push as well as this one, and every notification would arrive
// twice — once from the SDK, once from here. Reading payload.data keeps a single displayer.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || 'ورد';
  const body = data.body || '';
  self.registration.showNotification(title, {
    body,
    dir: 'rtl',
    lang: 'ar',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    // Per-message, not a single shared 'wird': one shared tag made each notification
    // silently replace the previous one.
    tag: data.tag || 'wird',
  });
});

// Tapping the notification focuses an open app or launches it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('/');
    })(),
  );
});
