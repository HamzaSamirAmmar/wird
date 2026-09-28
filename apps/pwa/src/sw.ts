/// <reference lib="webworker" />
//
// The app's single service worker (vite-plugin-pwa, injectManifest). Three jobs:
//
// 1. Offline shell: precache the build (app, mushaf text, self-hosted fonts) and serve
//    index.html for every navigation.
// 2. Push: FCM delivers DATA-ONLY messages (see supabase/functions/push-notifications); this
//    worker is the one and only displayer. Each message carries the recipient's duties for
//    today, which are written straight into the Dexie cache the app renders from — so tapping
//    the notification opens onto a working checklist even with no network.
// 3. Background Sync: flush checklist ticks queued offline once the connection returns, even
//    if the app was closed in the meantime (Chromium only; elsewhere the app flushes on open).

import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { DUTY_CATEGORY_LABELS } from '@wird/domain';
import { formatRange } from '@wird/quran-data';
import {
  applyDutySnapshot,
  db,
  flushOutboxWith,
  getMetaJSON,
  getMirroredAccessToken,
  OUTBOX_SYNC_TAG,
  setMetaJSON,
  type SnapshotDuty,
  type StepPatcher,
} from './lib/offline';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

// ─── 1. Offline shell ─────────────────────────────────────────────────────────

// registerType 'autoUpdate': a new build takes over at once rather than waiting for every tab
// to close.
self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// ─── 2. Push ──────────────────────────────────────────────────────────────────

/** Fields of the FCM data message (all strings — FCM data values always are). */
interface PushData {
  title?: string;
  body?: string;
  tag?: string;
  kind?: string;
  mid?: string;
  day?: string;
  link?: string;
  u?: string;
  wird?: string;
  duties?: string;
}

const SHOWN_KEY = 'shownPushIds';
const SHOWN_LIMIT = 50;

/** Pushes already displayed, by message id. Survives the notification being dismissed. */
async function wasShown(mid: string): Promise<boolean> {
  const shown = (await getMetaJSON<string[]>(SHOWN_KEY)) ?? [];
  return shown.includes(mid);
}

async function markShown(mid: string): Promise<void> {
  const shown = (await getMetaJSON<string[]>(SHOWN_KEY)) ?? [];
  await setMetaJSON(SHOWN_KEY, [mid, ...shown.filter((m) => m !== mid)].slice(0, SHOWN_LIMIT));
}

function parsePush(data: PushMessageData | null): PushData {
  try {
    const json = data?.json() as { data?: PushData } | PushData | undefined;
    // FCM wraps the data message: { data: {...}, from, fcmMessageId, priority }.
    return (json && 'data' in json && json.data ? json.data : (json as PushData)) ?? {};
  } catch {
    return {};
  }
}

/** "حفظ جديد: البقرة (1-10)" per unfinished duty, or a well-done line when all are done. */
function wirdSummary(duties: SnapshotDuty[]): string | null {
  if (duties.length === 0) return null;
  const open = duties.filter((d) => d.t !== 'completed');
  if (open.length === 0) return 'أتممت ورد اليوم — بارك الله فيك';
  return open
    .map((d) => {
      const range = formatRange({
        surahFrom: d.s[0],
        ayahFrom: d.s[1],
        surahTo: d.s[2],
        ayahTo: d.s[3],
      });
      return `${DUTY_CATEGORY_LABELS[d.c]}: ${range}`;
    })
    .join('\n');
}

async function broadcast(message: unknown) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage(message);
}

async function handlePush(raw: PushMessageData | null) {
  const data = parsePush(raw);
  const tag = data.tag || 'wird';

  // A device can still hold two live tokens for a while (e.g. the old worker's token until the
  // app is next opened), and FCM may redeliver. Same message id → shown once. The repeat still
  // calls showNotification, quietly replacing the same tag: iOS revokes the push subscription
  // of a worker that receives pushes without displaying anything.
  const duplicate = !!data.mid && (await wasShown(data.mid));

  let summary: string | null = null;
  if (data.duties && data.u && data.day) {
    try {
      const duties = JSON.parse(data.duties) as SnapshotDuty[];
      if (!duplicate) await applyDutySnapshot(data.u, data.day, duties);
      summary = wirdSummary(duties);
    } catch (e) {
      console.error('[wird/sw] could not apply duty snapshot', e);
    }
  }

  const title = data.title || 'ورد';
  let body = data.body || '';
  if (data.wird === '1' && summary) {
    // A new-duty ping is *about* the wird — the wird is the message. Elsewhere (a reminder,
    // the test) the text leads and the wird follows.
    body = data.kind === 'new_duty' ? summary : [body, summary].filter(Boolean).join('\n');
  }

  await self.registration.showNotification(title, {
    body,
    dir: 'rtl',
    lang: 'ar',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    // Per campaign, not one shared tag: a shared tag made each notification silently replace
    // the previous one.
    tag,
    // Replacing a tag is silent by default; a genuinely new message should still alert.
    renotify: !duplicate,
    silent: duplicate,
    data: { link: data.link || '/' },
  } as NotificationOptions);

  if (data.mid && !duplicate) await markShown(data.mid);
  // An open app re-renders from the cache we just updated.
  if (!duplicate) await broadcast({ type: 'wird:push', day: data.day ?? null });
}

self.addEventListener('push', (event) => {
  // waitUntil the whole chain, display included. The old worker did not return the
  // showNotification promise: the worker could be stopped before anything appeared, and iOS
  // counted those as silent pushes and eventually revoked the subscription.
  event.waitUntil(
    handlePush(event.data).catch(() =>
      self.registration.showNotification('ورد', {
        body: 'لديك تذكير جديد',
        dir: 'rtl',
        lang: 'ar',
      }),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link: string = event.notification.data?.link || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((c) => 'focus' in c);
      if (existing) {
        await existing.focus();
        // The app switches to the day itself — no reload, so its state survives.
        existing.postMessage({ type: 'wird:open', link });
        return;
      }
      await self.clients.openWindow(new URL(link, self.location.origin).href);
    })(),
  );
});

// ─── 3. Background Sync ───────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function restPatcher(accessToken: string): StepPatcher {
  return async (match, values) => {
    const filter =
      'id' in match
        ? `id=eq.${match.id}`
        : `duty_id=eq.${match.dutyId}&step_key=eq.${encodeURIComponent(match.stepKey)}`;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/duty_step_progress?${filter}&select=id`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          is_completed: values.isCompleted,
          completed_at: values.completedAt,
        }),
      });
      if (!res.ok) return null;
      // The token is known-valid (getMirroredAccessToken checks expiry), so zero rows really
      // means the step is gone.
      return ((await res.json()) as unknown[]).length;
    } catch {
      return null;
    }
  };
}

interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}

async function flushFromWorker() {
  // Only with an unexpired token. Refreshing belongs to the app: two refreshers racing on one
  // refresh token would sign the user out. Without a token the entries wait for the app.
  const token = await getMirroredAccessToken();
  if (!token) return;
  await flushOutboxWith(restPatcher(token));
  if ((await db.outbox.count()) > 0) {
    // Still offline — reject so the browser schedules another attempt.
    throw new Error('outbox not drained');
  }
  await broadcast({ type: 'wird:synced' });
}

self.addEventListener('sync', ((event: SyncEvent) => {
  if (event.tag === OUTBOX_SYNC_TAG) event.waitUntil(flushFromWorker());
}) as EventListener);
