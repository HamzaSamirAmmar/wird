import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type WirdSupabaseClient = SupabaseClient<Database>;

export interface CreateWirdClientOptions {
  url: string;
  anonKey: string;
  /** Pass a storage adapter for RN (e.g. AsyncStorage/MMKV). Web apps can omit this — defaults to localStorage. */
  storage?: SupportedStorage;
  /** Custom fetch for every REST/auth/functions request (e.g. to add a timeout). */
  fetch?: typeof fetch;
}

export function createWirdClient({
  url,
  anonKey,
  storage,
  fetch: customFetch,
}: CreateWirdClientOptions): WirdSupabaseClient {
  const baseFetch: typeof fetch = customFetch ?? ((input, init) => fetch(input, init));
  let client: WirdSupabaseClient;

  // An access token can lapse between supabase-js's refresh ticks (a phone waking from the
  // background, a throttled timer, a slow refresh): the request then comes back 401 and the
  // screen it fed (leaderboard, profile) just fails. Refresh once and replay with the new
  // token instead of surfacing it. The refresh itself is serialized by supabase-js, so many
  // concurrent 401s share one refresh and never present a rotated token twice.
  const authedFetch: typeof fetch = async (input, init) => {
    const res = await baseFetch(input, init);
    if (res.status !== 401 || input instanceof Request) return res;
    const url = typeof input === 'string' ? input : input.href;
    if (url.includes('/auth/v1/')) return res;
    const { data, error } = await client.auth.refreshSession();
    const token = data.session?.access_token;
    if (error || !token) return res;
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return baseFetch(input, { ...init, headers });
  };

  client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // no OAuth/magic-link redirects — username+password only
      ...(storage ? { storage } : {}),
    },
    global: { fetch: authedFetch },
  });
  return client;
}
