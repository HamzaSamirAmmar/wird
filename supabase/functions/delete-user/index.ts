// Admin-only: permanently deletes a user — the auth account, the profile, and (by cascade)
// their duties, checklists, push tokens and Telegram link. Not a soft delete.
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
    if (targetId === user.id) return json({ error: 'لا يمكنك حذف حسابك' }, 403);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('id, role, group_id, admin_group_id')
      .eq('id', targetId)
      .single();
    if (targetError || !target) return json({ error: 'المستخدم غير موجود' }, 404);

    if (target.role === 'superadmin') {
      return json({ error: 'لا يمكن حذف حساب مدير عام' }, 403);
    }
    if (!isSuperadmin) {
      if (target.role !== 'employee' || target.admin_group_id) {
        return json({ error: 'لا يمكنك حذف حساب مشرف' }, 403);
      }
      if (target.group_id !== callerAdminGroup) {
        return json({ error: 'لا يمكن حذف مستخدم خارج مجموعتك' }, 403);
      }
    }

    // Deleting the auth user cascades to the profile, and from there to duties, checklists,
    // tokens and the Telegram link; authored plans/campaigns are kept with a null author.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetId);
    if (deleteError) return json({ error: deleteError.message }, 500);

    return json({ ok: true }, 200);
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
