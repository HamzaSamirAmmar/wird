import { createWirdClient } from '@wird/supabase-client';
import { fetchWithTimeout } from './connectivity';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check your .env.local');
}

// Timeout + reachability reporting on every request: on Wi-Fi without internet a request
// otherwise hangs indefinitely, and so does whatever awaits it.
export const supabase = createWirdClient({ url, anonKey, fetch: fetchWithTimeout });
