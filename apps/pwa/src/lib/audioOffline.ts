// ─── Offline recitation audio ────────────────────────────────────────────────
//
// cdn.islamic.network sends no CORS headers, so the page cannot read the MP3s it fetches.
// It can still *store* them: a `no-cors` fetch resolves to an opaque response, and
// Cache API accepts opaque bodies. The service worker serves that cache back to the
// <audio> element offline (cache-first route with range support — see src/sw.ts), where
// a media load is itself a no-cors request and happily consumes an opaque response.
//
// Every fetch here runs through the SW route as well, so when the worker controls the
// page the body is cached twice at most (same key, same bytes) — harmless.

import type { AudioBitrate } from './reciters';
import { audioUrl } from './reciters';

const AUDIO_CACHE = 'wird-audio-v1';

/** How many ayah files to pull at once — enough to saturate a link, not starve the UI. */
const CONCURRENCY = 3;

async function audioCache(): Promise<Cache> {
  return caches.open(AUDIO_CACHE);
}

export async function audioCacheSize(): Promise<number> {
  try {
    const c = await audioCache();
    return (await c.keys()).length;
  } catch {
    return 0;
  }
}

/** How many of `urls` are already downloaded (0 when Cache Storage is unavailable). */
export async function countCached(urls: string[]): Promise<number> {
  try {
    const c = await audioCache();
    let n = 0;
    for (const u of urls) if (await c.match(u)) n++;
    return n;
  } catch {
    return 0;
  }
}

export interface DownloadProgress {
  done: number;
  total: number;
}

/**
 * Downloads every URL not already cached, reporting progress. Resolves with the number
 * of files that failed (0 = complete). No-cors failures surface as fetch rejections;
 * each file is retried once.
 */
export async function downloadAudios(
  urls: string[],
  onProgress?: (p: DownloadProgress) => void,
): Promise<number> {
  const c = await audioCache();
  const todo: string[] = [];
  for (const u of urls) if (!(await c.match(u))) todo.push(u);
  let done = urls.length - todo.length;
  let failed = 0;
  onProgress?.({ done, total: urls.length });

  let cursor = 0;
  async function worker() {
    for (let i = cursor++; i < todo.length; i = cursor++) {
      const url = todo[i]!;
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try {
          const res = await fetch(url, { mode: 'no-cors' });
          // Opaque responses are status 0; only a network/style failure rejects.
          await c.put(url, res);
          ok = true;
        } catch {
          if (attempt === 1) {
            // Some engines refuse to put opaque responses page-side; the SW route may
            // still have cached the same fetch — only a real miss counts as a failure.
            ok = Boolean(await c.match(url));
            if (!ok) failed++;
          } else {
            await new Promise((r) => setTimeout(r, 800));
          }
        }
      }
      done++;
      onProgress?.({ done, total: urls.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return failed;
}

/** Drops every downloaded audio file. */
export async function clearAudioCache(): Promise<void> {
  try {
    await caches.delete(AUDIO_CACHE);
  } catch {
    /* nothing stored */
  }
}

/**
 * Asks the browser not to evict our downloads under storage pressure. Best-effort; iOS
 * may still reclaim space, in which case the next download simply re-fetches.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (!navigator.storage?.persist) return;
    const already = await navigator.storage.persisted?.();
    if (!already) await navigator.storage.persist();
  } catch {
    /* unsupported — downloads live with default eviction rules */
  }
}

/** URLs of a wird queue at one quality — the download set of «تنزيل صوت الورد». */
export function queueUrls(
  globalAyahs: number[],
  reciterId: string,
  bitrate: AudioBitrate,
): string[] {
  return globalAyahs.map((g) => audioUrl(reciterId, bitrate, g));
}
