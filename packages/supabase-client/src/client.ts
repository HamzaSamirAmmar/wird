import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type WirdSupabaseClient = SupabaseClient<Database>;

export interface CreateWirdClientOptions {
  url: string;
  anonKey: string;
  /** Pass a storage adapter for RN (e.g. AsyncStorage/MMKV). Web apps can omit this — defaults to localStorage. */
  storage?: SupportedStorage;
}

export function createWirdClient({ url, anonKey, storage }: CreateWirdClientOptions): WirdSupabaseClient {
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // no OAuth/magic-link redirects — username+password only
      ...(storage ? { storage } : {}),
    },
  });
}
