// Admin-only: creates an employee account with an auto-generated password. A superadmin may
// also create an admin-only account (role 'supervisor') or an employee who is ALSO an admin of
// a group (`adminGroupId`, which may differ from the employee's own group).
// Requires SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase).

import { createClient } from 'npm:@supabase/supabase-js@2';

// Inlined (rather than imported from ../_shared/cors.ts) so this function deploys as a
// single self-contained file with no relative-import path resolution to worry about.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const USERNAME_PATTERN = /^[a-z0-9_.]{3,32}$/;
// Telegram usernames: 5–32 chars, letters/digits/underscore. Stored normalized (lowercase,
// no '@') to match what the telegram-webhook receives; null when not provided.
const TELEGRAM_USERNAME_PATTERN = /^[a-z0-9_]{5,32}$/;
const SYNTHETIC_EMAIL_DOMAIN = 'wird.local';

function normalizeTelegramUsername(v: unknown): string | null {
  const s = String(v ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  return s === '' ? null : s;
}

// Short and lowercase so it can be typed on a phone; it is temporary (must_change_password)
// and 6 is Supabase Auth's minimum. No look-alikes (0/o, 1/l/i).
function generatePassword(length = 6): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Client scoped to the caller's own JWT, to verify who's calling and that they're a supervisor.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) {
      return json({ error: 'Invalid session' }, 401);
    }

    const { data: callerProfile, error: callerProfileError } = await callerClient
      .from('profiles')
      .select('role, group_id, admin_group_id')
      .eq('id', user.id)
      .single();

    const callerIsSuperadmin = callerProfile?.role === 'superadmin';
    const callerAdminGroup: string | null = callerProfile?.admin_group_id ?? null;
    if (callerProfileError || (!callerIsSuperadmin && !callerAdminGroup)) {
      return json({ error: 'Only supervisors or superadmins can create accounts' }, 403);
    }

    const body = await req.json();
    const username = String(body.username ?? '')
      .trim()
      .toLowerCase();
    const fullName = String(body.fullName ?? '').trim();
    const groupId = String(body.groupId ?? '').trim();
    const role = body.role === 'supervisor' ? 'supervisor' : 'employee';
    const telegramUsername = normalizeTelegramUsername(body.telegramUsername);
    // Employee-and-admin: the group they manage. Admin-only accounts manage the group they sit in.
    const requestedAdminGroup = String(body.adminGroupId ?? '').trim() || null;

    if (!USERNAME_PATTERN.test(username)) {
      return json({ error: 'اسم مستخدم غير صالح' }, 400);
    }
    if (fullName.length < 2) {
      return json({ error: 'الاسم قصير جداً' }, 400);
    }
    if (!groupId) {
      return json({ error: 'يجب اختيار مجموعة' }, 400);
    }
    if (role === 'employee' && !telegramUsername) {
      return json({ error: 'معرف تيليجرام مطلوب' }, 400);
    }
    if (telegramUsername && !TELEGRAM_USERNAME_PATTERN.test(telegramUsername)) {
      return json({ error: 'معرف تيليجرام غير صالح' }, 400);
    }

    // A group admin may only create plain employees, and only within the group they manage.
    if (!callerIsSuperadmin) {
      if (role !== 'employee' || requestedAdminGroup) {
        return json({ error: 'المشرف لا يمكنه إنشاء حساب مشرف' }, 403);
      }
      if (groupId !== callerAdminGroup) {
        return json({ error: 'لا يمكن إنشاء حساب خارج مجموعتك' }, 403);
      }
    }
    const adminGroupId = role === 'supervisor' ? groupId : requestedAdminGroup;

    // Service-role client for privileged writes (creating the auth user + profile).
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    for (const id of new Set([groupId, adminGroupId].filter((g): g is string => !!g))) {
      const { data: group, error: groupError } = await adminClient
        .from('groups')
        .select('id')
        .eq('id', id)
        .single();
      if (groupError || !group) {
        return json({ error: 'المجموعة غير موجودة' }, 400);
      }
    }

    const email = `${username}@${SYNTHETIC_EMAIL_DOMAIN}`;
    const password = generatePassword();

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      const message = createError?.message?.includes('already been registered')
        ? 'اسم المستخدم مستخدم بالفعل'
        : (createError?.message ?? 'فشل إنشاء الحساب');
      return json({ error: message }, 409);
    }

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: created.user.id,
      username,
      full_name: fullName,
      role,
      group_id: groupId,
      admin_group_id: adminGroupId,
      telegram_username: telegramUsername,
      must_change_password: true,
    });

    if (profileError) {
      // Roll back the orphaned auth user if the profile insert failed.
      await adminClient.auth.admin.deleteUser(created.user.id);
      const message =
        profileError.code === '23505' ? 'هذا المعرف مستخدم لمستخدم آخر' : profileError.message;
      return json({ error: message }, profileError.code === '23505' ? 409 : 500);
    }

    return json({ username, fullName, password }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
