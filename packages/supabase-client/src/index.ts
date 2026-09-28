export * from './client';
export * from './auth';
export type { Database } from './database.types';
// Distinguishes "the network failed" from "the session is really gone" — the PWA stays signed
// in offline on the former.
export { isAuthRetryableFetchError } from '@supabase/supabase-js';
