// Sends FCM web-push notifications for a notification_campaigns row.
//
// Called two ways:
//   1. Dashboard (supervisor): Authorization = the caller's session JWT. Verified against profiles.
//   2. pg_cron dispatcher (dispatch_due_campaigns): Authorization = the service-role key
//      stored in Vault as 'wird_dispatch_key'.
//
// Sends atomically "claims" the campaign (advances next_run_at) before delivering, so a
// concurrent cron tick + dashboard click can never double-send the same campaign.
//
// Requires the secret: FCM_SERVICE_ACCOUNT = the Firebase service-account JSON
// (supabase secrets set FCM_SERVICE_ACCOUNT='{...}').

import { createClient } from 'npm:@supabase/supabase-js@2';

// Inlined (rather than imported from ../_shared/cors.ts) so this function deploys as a
// single self-contained file with no relative-import path resolution to worry about.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── JWT helpers (service-account → OAuth access token) ──────────────────────

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function strToBase64Url(s: string): string {
  return bytesToBase64Url(encoder.encode(s));
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const iat = Math.floor(Date.now() / 1000);
  const header = strToBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = strToBase64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp: iat + 3600,
    }),
  );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key) as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(`${header}.${claims}`) as BufferSource,
  );
  const assertion = `${header}.${claims}.${bytesToBase64Url(new Uint8Array(signature))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${await res.text()}`);
  const data = await res.json();

  cachedAccessToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token as string;
}

// ─── FCM send ─────────────────────────────────────────────────────────────────

const CONCURRENCY = 30;

// Must match next_campaign_run() in the migrations (Asia/Damascus, fixed +03, no DST).
const CAMPAIGN_TIME_ZONE = 'Asia/Damascus';

async function sendToAll(
  sa: ServiceAccount,
  accessToken: string,
  tokens: string[],
  title: string,
  body: string,
): Promise<{ sent: number; failed: number; invalidTokens: string[] }> {
  const invalidTokens: string[] = [];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < tokens.length; i += CONCURRENCY) {
    const chunk = tokens.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (token) => {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: { token, notification: { title, body } },
            }),
          },
        );
        return { token, ok: res.ok, status: res.status, text: await res.text() };
      }),
    );
    for (const r of results) {
      if (r.ok) {
        sent++;
      } else {
        failed++;
        // 404/410 UNREGISTERED = token dead (uninstalled, cleared, expired) → prune it.
        if (r.status === 404 || r.status === 410 || r.text.includes('UNREGISTERED')) {
          invalidTokens.push(r.token);
        }
      }
    }
  }

  return { sent, failed, invalidTokens };
}

// ─── Request handling ─────────────────────────────────────────────────────────

function decodeJwtRole(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = authHeader.slice('Bearer '.length).split('.')[1];
  if (!payload) return null;
  try {
    const bin = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(bin).role as string) ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');

    // Cron path: platform already verified the JWT signature; service_role short-circuits.
    let role = decodeJwtRole(authHeader);

    if (role !== 'service_role') {
      // Interactive path: verify the caller is a supervisor through their own JWT.
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader ?? '' } },
      });
      const {
        data: { user },
        error: userError,
      } = await callerClient.auth.getUser();
      if (userError || !user) return json({ error: 'Invalid session' }, 401);

      const { data: profile } = await callerClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'supervisor') return json({ error: 'Only supervisors can send' }, 403);
      role = profile.role;
    }

    const { campaignId } = await req.json();
    if (!campaignId) return json({ error: 'campaignId is required' }, 400);

    const saRaw = Deno.env.get('FCM_SERVICE_ACCOUNT');
    if (!saRaw) {
      return json({ error: 'FCM_SERVICE_ACCOUNT secret not configured' }, 500);
    }
    const sa: ServiceAccount = JSON.parse(saRaw);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Atomically claim the campaign: advance next_run_at first so a concurrent dispatch
    // (cron tick racing a dashboard click) can never double-send.
    const { data: campaign, error: claimError } = await admin
      .from('notification_campaigns')
      .update({
        next_run_at: null,
        last_error: null,
      })
      .eq('id', campaignId)
      .eq('is_active', true)
      .lte('next_run_at', new Date().toISOString())
      .select(
        'id, title, body, audience, target_profile_id, schedule_kind, recur_weekday, recur_time',
      )
      .single();

    if (claimError || !campaign) {
      return json({ skipped: true, reason: 'already-dispatched-or-not-due' });
    }

    // Resolve the audience into a token list.
    let tokens: string[] = [];
    if (campaign.audience === 'all') {
      const { data } = await admin
        .from('fcm_tokens')
        .select('token, profiles!inner(is_active)')
        .eq('profiles.is_active', true);
      tokens = (data ?? []).map((r: { token: string }) => r.token);
    } else if (campaign.audience === 'user') {
      const { data } = await admin
        .from('fcm_tokens')
        .select('token, profiles!inner(is_active)')
        .eq('profiles.is_active', true)
        .eq('profile_id', campaign.target_profile_id);
      tokens = (data ?? []).map((r: { token: string }) => r.token);
    } else {
      // incomplete_today: employees with at least one duty due today that isn't completed.
      // due_date is a local calendar day, so "today" has to be resolved in the campaign's
      // zone. toISOString() gives the UTC day, which east of Greenwich is the *previous*
      // day until 03:00 local — this audience silently targeted yesterday every night.
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: CAMPAIGN_TIME_ZONE }).format(
        new Date(),
      );
      const { data: rows } = await admin
        .from('duties')
        .select('employee_id, status')
        .eq('due_date', today);
      const totals = new Map<string, { total: number; done: number }>();
      for (const r of rows ?? []) {
        const cur = totals.get(r.employee_id) ?? { total: 0, done: 0 };
        cur.total++;
        if (r.status === 'completed') cur.done++;
        totals.set(r.employee_id, cur);
      }
      const incomplete = [...totals.entries()]
        .filter(([, v]) => v.done < v.total)
        .map(([id]) => id);
      if (incomplete.length > 0) {
        const { data } = await admin
          .from('fcm_tokens')
          .select('token, profiles!inner(is_active)')
          .eq('profiles.is_active', true)
          .in('profile_id', incomplete);
        tokens = (data ?? []).map((r: { token: string }) => r.token);
      }
    }

    let sent = 0;
    let failed = 0;
    let errorMessage: string | null = null;

    if (tokens.length > 0) {
      try {
        const accessToken = await getAccessToken(sa);
        const result = await sendToAll(sa, accessToken, tokens, campaign.title, campaign.body);
        sent = result.sent;
        failed = result.failed;

        if (result.invalidTokens.length > 0) {
          await admin.from('fcm_tokens').delete().in('token', result.invalidTokens);
        }
      } catch (e) {
        errorMessage = e instanceof Error ? e.message : String(e);
      }
    }

    // Stamp results. Recurring campaigns get their next occurrence; once/now are done
    // (next_run_at already null from the claim). Missing 'daily' here would let a daily rule
    // fire exactly once and then go quiet, which is indistinguishable from it working.
    const patch: Record<string, unknown> = {
      last_sent_at: new Date().toISOString(),
      last_sent_count: sent,
      last_error: errorMessage,
    };
    if (campaign.schedule_kind === 'weekly' || campaign.schedule_kind === 'daily') {
      const { data: nextRun } = await admin.rpc('next_campaign_run', {
        p_kind: campaign.schedule_kind,
        p_scheduled_at: null,
        p_weekday: campaign.recur_weekday,
        p_time: campaign.recur_time,
      });
      patch.next_run_at = nextRun;
    }
    await admin.from('notification_campaigns').update(patch).eq('id', campaign.id);

    return json({ sent, failed, tokens: tokens.length, error: errorMessage });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
