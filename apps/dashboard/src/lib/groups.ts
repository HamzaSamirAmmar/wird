import type { Profile } from '@wird/domain';
import { supabase } from './supabase';

/**
 * The groups the viewer manages. A superadmin gets all of them; a group admin gets only the one
 * they manage — RLS also lets them read their own employee group (when it differs), which is
 * not theirs to administer and must not show up in pickers.
 */
export function managedGroups(profile: Profile | null) {
  const q = supabase.from('groups').select('id, name').order('name');
  return profile && profile.role !== 'superadmin' && profile.adminGroupId
    ? q.eq('id', profile.adminGroupId)
    : q;
}
