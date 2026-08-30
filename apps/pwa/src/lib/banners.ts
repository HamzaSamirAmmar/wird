import { supabase } from './supabase';
import { db, type CachedBanner } from './offline';

const BANNER_COLUMNS = 'id, body, source, sort_order, created_at';

/**
 * Banners are cache-first, like duties.
 *
 * They used to be fetched straight from Supabase behind a `navigator.onLine` guard, which meant
 * the reminder simply vanished offline — the one part of the screen that needs no network to be
 * worth reading. Now the cache is the source the UI renders and the network only refreshes it.
 */
export async function getCachedBanners(): Promise<CachedBanner[]> {
  return db.banners.orderBy('sortOrder').toArray();
}

export async function refreshBannersFromServer(): Promise<void> {
  if (!navigator.onLine) return;

  const { data, error } = await supabase
    .from('banners')
    .select(BANNER_COLUMNS)
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at', { ascending: false });

  // A failed refresh must leave the cache alone: showing yesterday's reminder beats showing
  // nothing because the network blipped.
  if (error) return;

  const rows: CachedBanner[] = (data ?? []).map((r) => ({
    id: r.id,
    body: r.body,
    source: r.source,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }));

  await db.transaction('rw', db.banners, async () => {
    // Replace wholesale rather than upsert: a banner the supervisor hid or deleted has to
    // disappear here too, and an upsert would leave it on screen forever.
    await db.banners.clear();
    await db.banners.bulkPut(rows);
  });
}
