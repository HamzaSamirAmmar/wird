import * as React from 'react';
import { supabase } from './supabase';
import { getMetaJSON, setMetaJSON } from './offline';

/**
 * The name of the viewer's own group, cache-first like everything else on the home screen:
 * the cached name shows instantly (and offline), the network only refreshes it. RLS lets an
 * employee read exactly one row of `groups` — their own.
 */
export function useGroupName(groupId: string | null | undefined): string | null {
  const [name, setName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!groupId) {
      setName(null);
      return;
    }
    let cancelled = false;
    const key = `group:${groupId}`;
    (async () => {
      const cached = await getMetaJSON<string>(key);
      if (cancelled) return;
      if (cached) setName(cached);
      if (!navigator.onLine) return;
      const { data } = await supabase.from('groups').select('name').eq('id', groupId).maybeSingle();
      if (cancelled || !data?.name) return;
      setName(data.name);
      await setMetaJSON(key, data.name);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return name;
}
