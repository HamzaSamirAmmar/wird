import { usernameToSyntheticEmail } from '@wird/domain';
import type { WirdSupabaseClient } from './client';

export async function signInWithUsername(
  client: WirdSupabaseClient,
  username: string,
  password: string,
) {
  const email = usernameToSyntheticEmail(username);
  return client.auth.signInWithPassword({ email, password });
}

export async function changeOwnPassword(client: WirdSupabaseClient, newPassword: string) {
  const { error: updateError } = await client.auth.updateUser({ password: newPassword });
  if (updateError) return { error: updateError };

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { error: new Error('No authenticated user') };

  const { error: profileError } = await client
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', userId);

  return { error: profileError ?? null };
}
