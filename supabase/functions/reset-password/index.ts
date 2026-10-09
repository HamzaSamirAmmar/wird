// Admin-only: gives a user a new generated password and sets must_change_password, so their
// next sign-in (or the next time an open app refreshes its profile) lands on the
// change-password screen. Returns the password once, for the admin to send — same as
// create-employee. Who may reset whom mirrors delete-user:
//   - superadmin: anyone except themselves and other superadmins
//   - group admin: plain employees of the group they manage (never themselves or another admin)
// Requires SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase).

import { createClient } from 'npm:@supabase/supabase-js@2';

// Inlined on purpose, like create-employee: the function deploys as one self-contained file.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Same alphabet and length as create-employee: short, lowercase, no look-alikes (0/o, 1/l/i);
// temporary by construction (must_change_password), and 6 is Supabase Auth's minimum.
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
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    const { data: caller, error: callerError } = await callerClient
      .from('profiles')
      .select('role, admin_group_id')
      .eq('id', user.id)
      .single();
    const isSuperadmin = caller?.role === 'superadmin';
    const callerAdminGroup: string | null = caller?.admin_group_id ?? null;
    if (callerError || (!isSuperadmin && !callerAdminGroup)) {
      return json({ error: 'غير مصرح' }, 403);
    }

    const body = await req.json();
    const targetId = String(body.userId ?? '').trim();
    if (!targetId) return json({ error: 'معرف المستخدم مطلوب' }, 400);
    if (targetId === user.id) {
      return json({ error: 'غيّر كلمة مرورك من صفحة تغيير كلمة المرور' }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('id, username, full_name, role, group_id, admin_group_id')
      .eq('id', targetId)
      .single();
    if (targetError || !target) return json({ error: 'المستخدم غير موجود' }, 404);

    if (target.role === 'superadmin') {
      return json({ error: 'لا يمكن إعادة تعيين كلمة مرور مدير عام' }, 403);
    }
    if (!isSuperadmin) {
      if (target.role !== 'employee' || target.admin_group_id) {
        return json({ error: 'لا يمكنك إعادة تعيين كلمة مرور مشرف' }, 403);
      }
      if (target.group_id !== callerAdminGroup) {
        return json({ error: 'لا يمكن إعادة تعيين كلمة مرور مستخدم خارج مجموعتك' }, 403);
      }
    }

    const password = generatePassword();
    const { error: authError } = await adminClient.auth.admin.updateUserById(targetId, {
      password,
    });
    if (authError) return json({ error: authError.message }, 500);

    // The new password is temporary: force the change on next use, exactly like a new account.
    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', targetId);
    if (profileError) return json({ error: profileError.message }, 500);

    return json({ username: target.username, fullName: target.full_name, password }, 200);
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
