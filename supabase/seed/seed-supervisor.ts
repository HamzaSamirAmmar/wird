// Bootstrap script: creates the very first supervisor account.
// Needed because create-employee (the normal account-creation path) requires an
// already-authenticated supervisor caller — this breaks that chicken-and-egg problem.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   SEED_SUPERVISOR_USERNAME=admin SEED_SUPERVISOR_PASSWORD=... SEED_SUPERVISOR_NAME="..." \
//   node --experimental-strip-types supabase/seed/seed-supervisor.ts

import { createClient } from '@supabase/supabase-js';

const url = requireEnv('SUPABASE_URL');
const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const username = requireEnv('SEED_SUPERVISOR_USERNAME').trim().toLowerCase();
const password = requireEnv('SEED_SUPERVISOR_PASSWORD');
const fullName = process.env.SEED_SUPERVISOR_NAME?.trim() || 'المشرف الرئيسي';

if (!/^[a-z0-9_.]{3,32}$/.test(username)) {
  console.error('SEED_SUPERVISOR_USERNAME must be 3-32 chars: lowercase letters, digits, "_" or "."');
  process.exit(1);
}
if (password.length < 8) {
  console.error('SEED_SUPERVISOR_PASSWORD must be at least 8 characters');
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey);
const email = `${username}@wird.local`;

async function main() {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    console.error('Failed to create auth user:', createError?.message);
    process.exit(1);
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    username,
    full_name: fullName,
    role: 'supervisor',
    group_id: null,
    must_change_password: false,
    is_active: true,
  });

  if (profileError) {
    console.error('Failed to create profile row:', profileError.message);
    await admin.auth.admin.deleteUser(created.user.id);
    process.exit(1);
  }

  console.log(`Seeded supervisor "${username}" — log in with that username and the password you set.`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

main();
