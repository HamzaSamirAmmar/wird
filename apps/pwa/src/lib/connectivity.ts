import * as React from 'react';

/**
 * Whether the app can actually reach the server — not just whether the OS says it has a
 * network. `navigator.onLine` is true on Wi-Fi with no internet ("lie-fi") and on captive
 * portals, where every request used to hang with the refresh spinner turning forever.
 *
 * The truth comes from real requests: the fetch wrapper in lib/supabase.ts reports every
 * success and every network failure/timeout here. `navigator.onLine === false` is still
 * trusted immediately, since the OS is never wrong in that direction.
 */

let reachable = true;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function reportReachable(ok: boolean) {
  if (reachable === ok) return;
  reachable = ok;
  emit();
}

export function isOnline(): boolean {
  return navigator.onLine && reachable;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export function useOnline(): boolean {
  return React.useSyncExternalStore(subscribe, isOnline);
}

// Coming back online is reported by the OS; give requests a fresh chance to prove it.
window.addEventListener('online', () => reportReachable(true));

const REQUEST_TIMEOUT_MS = 12_000;

/**
 * fetch with a timeout, reporting reachability. Aborts after REQUEST_TIMEOUT_MS unless the
 * caller's own signal fires first. Any HTTP response — even a 4xx/5xx — proves the server is
 * reachable; only a thrown network error or the timeout counts as offline.
 */
export const fetchWithTimeout: typeof fetch = async (input, init) => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  // AbortSignal.any is missing before iOS 17.4; there the caller's own signal wins and the
  // request simply goes without our timeout.
  const signal = !init?.signal
    ? timeout
    : typeof AbortSignal.any === 'function'
      ? AbortSignal.any([init.signal, timeout])
      : init.signal;
  try {
    const res = await fetch(input, { ...init, signal });
    reportReachable(true);
    return res;
  } catch (e) {
    // A caller-initiated abort says nothing about the network.
    if (!init?.signal?.aborted) reportReachable(false);
    throw e;
  }
};
