// Sends FCM web-push notifications for a notification_campaigns row — and, for campaigns
// flagged `telegram` (plus duty pings), the same message to linked Telegram chats
// (telegram_chats, populated by the telegram-webhook function when employees tap Start).
//
// Called four ways:
//   1. Dashboard (superadmin, or a supervisor for their own group's campaigns):
//      Authorization = the caller's session JWT. Verified against profiles.
//   2. pg_cron dispatcher (dispatch_due_campaigns): Authorization = the service-role key
//      stored in Vault as 'wird_dispatch_key'.
//   3. System pings ({ auto: { kind: 'new_duty' } }), service-role only: fired by the
//      notify_new_duties trigger when a supervisor assigns a duty for *today*. These carry no
//      campaign row — they are not something anyone authored, scheduled or can disable, and
//      logging them as campaigns would bury the real ones under machine noise.
//   4. Test ping ({ auto: { kind: 'test' } }): any signed-in user, to their own devices only.
//
// Every message carries the recipient's duties for today (push_targets() in SQL). The PWA
// service worker writes them into its offline cache and builds the notification text from
// them, so tapping a reminder opens onto a working checklist even with no network.
//
// Sends atomically "claims" the campaign (advances next_run_at) before delivering, so a
// concurrent cron tick + dashboard click can never double-send the same campaign.
//
// Requires the secret: FCM_SERVICE_ACCOUNT = the Firebase service-account JSON
// (supabase secrets set FCM_SERVICE_ACCOUNT='{...}'). Telegram sends additionally need
// TELEGRAM_BOT_TOKEN; without it the Telegram pass is silently skipped (push-only).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

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

// Web push caps the whole payload at 4 KB. Past this the duty snapshot is dropped and the
// service worker falls back to the plain text; the app then syncs the day when opened.
const MAX_DUTIES_BYTES = 3000;

/** One profile's devices + today's duties, as returned by push_targets() (see migration). */
interface PushTarget {
  p: string;
  t: string[] | null;
  /** Linked Telegram chat (telegram_chats.chat_id); null when the employee never tapped Start. */
  g?: number | null;
  d: unknown[];
}

/** What the message says; the per-recipient parts (profile, duties) are added per target. */
interface Message {
  title: string;
  body: string;
  // Collapses re-sends of the *same* campaign, while letting different campaigns stack.
  // A single shared tag would make a duty reminder silently replace a supervisor's message.
  tag: string;
  // 'campaign' | 'new_duty' | 'test'. The service worker decides from it whether the body
  // should be the day's wird rather than free text.
  kind: string;
  // Lead with today's wird in the notification body (duty reminders), not just the text.
  showWird: boolean;
}

interface SendResult {
  sent: number;
  failed: number;
  /** Profiles that received the message on at least one device — a set, so the Telegram
   *  pass can union with it instead of double-counting a person reached on both channels. */
  reached: Set<string>;
  invalidTokens: string[];
}

// Status/error codes meaning the token itself is dead or foreign — prune rather than retry.
function isDeadToken(status: number, text: string): boolean {
  return (
    status === 404 ||
    status === 410 ||
    text.includes('UNREGISTERED') ||
    text.includes('SENDER_ID_MISMATCH') ||
    (status === 400 && text.includes('registration token'))
  );
}

async function sendToTargets(
  sa: ServiceAccount,
  accessToken: string,
  targets: PushTarget[],
  message: Message,
): Promise<SendResult> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: CAMPAIGN_TIME_ZONE }).format(
    new Date(),
  );
  // One id per logical send, shared by every device of every recipient. The service worker
  // shows a given mid once, so a device that still holds two live tokens (or a push that FCM
  // retries) cannot produce a second notification.
  const mid = `${message.kind}-${crypto.randomUUID()}`;

  const jobs: { token: string; profileId: string; data: Record<string, string> }[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    const duties = JSON.stringify(target.d ?? []);
    const data: Record<string, string> = {
      title: message.title,
      body: message.body,
      tag: message.tag,
      kind: message.kind,
      mid,
      // The day the snapshot belongs to — also where tapping the notification lands.
      day: today,
      link: `/?date=${today}`,
      u: target.p,
      wird: message.showWird ? '1' : '0',
    };
    if (duties.length <= MAX_DUTIES_BYTES) data.duties = duties;
    for (const token of target.t ?? []) {
      if (seen.has(token)) continue;
      seen.add(token);
      jobs.push({ token, profileId: target.p, data });
    }
  }

  const invalidTokens: string[] = [];
  const reached = new Set<string>();
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const chunk = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (job) => {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            // DATA-ONLY, deliberately. A `notification` payload makes the browser/FCM display
            // the notification on its own, in addition to our service worker — every push
            // arrived twice. With data-only there is exactly one displayer: apps/pwa/src/sw.ts.
            body: JSON.stringify({
              message: {
                token: job.token,
                data: job.data,
                webpush: {
                  headers: { Urgency: 'high', TTL: '86400' },
                  fcm_options: { link: job.data.link },
                },
              },
            }),
          },
        );
        return { job, ok: res.ok, status: res.status, text: await res.text() };
      }),
    );
    for (const r of results) {
      if (r.ok) {
        sent++;
        reached.add(r.job.profileId);
      } else {
        failed++;
        if (isDeadToken(r.status, r.text)) invalidTokens.push(r.job.token);
      }
    }
  }

  return { sent, failed, reached, invalidTokens };
}

// ─── Telegram send ────────────────────────────────────────────────────────────
//
// The second delivery channel for duty notifications. Same snapshot, same wording as the
// push notification the service worker would build — the bot is simply the one displayer
// there, where here it is the app.

// Telegram allows ~30 messages/s overall but only ~1/s per chat; a small concurrency cap
// keeps a morning burst polite. Workplace group sizes sit far below the global limit.
const TELEGRAM_CONCURRENCY = 3;

// Edge functions cannot import workspace packages (see create-employee), so the surah
// names and duty category labels — duplicated in packages/quran-data and packages/domain —
// are inlined here. Keep in sync with those.
const TELEGRAM_SURAHS = [
  'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال',
  'التوبة', 'يونس', 'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء',
  'الكهف', 'مريم', 'طه', 'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء',
  'النمل', 'القصص', 'العنكبوت', 'الروم', 'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر',
  'يس', 'الصافات', 'ص', 'الزمر', 'غافر', 'فصلت', 'الشورى', 'الزخرف', 'الدخان',
  'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق', 'الذاريات', 'الطور', 'النجم',
  'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة', 'الصف',
  'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة',
  'المعارج', 'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات',
  'النبأ', 'النازعات', 'عبس', 'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج',
  'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد', 'الشمس', 'الليل', 'الضحى', 'الشرح',
  'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات', 'القارعة', 'التكاثر',
  'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
  'المسد', 'الإخلاص', 'الفلق', 'الناس',
];

const TELEGRAM_CATEGORY_LABELS: Record<string, string> = {
  new_memorization: 'حفظ جديد',
  minor_review: 'مراجعة صغرى',
  major_review: 'مراجعة كبرى',
};

/** One duty as built by push_targets(): { i, c, s: [surahFrom, ayahFrom, surahTo, ayahTo], … }. */
interface SnapshotDuty {
  c: string;
  s: number[];
  t: string;
}

// Telegram's parse_mode=HTML has exactly these three entities to escape in plain text.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Mirrors formatRange() in packages/quran-data — same output, inlined names.
function formatSnapshotRange(d: SnapshotDuty): string {
  const [surahFrom, ayahFrom, surahTo, ayahTo] = d.s;
  const from = TELEGRAM_SURAHS[surahFrom - 1];
  const to = TELEGRAM_SURAHS[surahTo - 1];
  if (surahFrom === surahTo) return `${from} (${ayahFrom}-${ayahTo})`;
  return `${from} (${ayahFrom}) - ${to} (${ayahTo})`;
}

// Mirrors wirdSummary() in apps/pwa/src/sw.ts: the day's unfinished duties, or a
// well-done line when everything is already complete.
function telegramWirdSummary(duties: SnapshotDuty[]): string | null {
  if (duties.length === 0) return null;
  const open = duties.filter((d) => d.t !== 'completed');
  if (open.length === 0) return 'أتممت ورد اليوم — بارك الله فيك';
  return open
    .map((d) => `${TELEGRAM_CATEGORY_LABELS[d.c] ?? d.c}: ${formatSnapshotRange(d)}`)
    .join('\n');
}

function telegramMessageText(message: Message, duties: unknown[]): string {
  const summary = telegramWirdSummary(duties as SnapshotDuty[]);
  let body = message.body;
  if (message.showWird && summary) {
    // Same rule as the service worker: a new-duty ping leads with the wird; everywhere
    // else the authored text leads and the wird follows.
    body = message.kind === 'new_duty' ? summary : [body, summary].filter(Boolean).join('\n');
  }
  return `<b>${escapeHtml(message.title)}</b>${body ? `\n\n${escapeHtml(body)}` : ''}`;
}

interface TelegramResult {
  sent: number;
  failed: number;
  reached: Set<string>;
}

// A chat that rejects the message is dead — the employee blocked the bot or deleted the
// chat. Telegram answers 403 ("bot was blocked by the user") or 400 "chat not found";
// prune exactly like an unregistered FCM token.
function isDeadChat(status: number, text: string): boolean {
  return status === 403 || (status === 400 && text.includes('chat not found'));
}

async function sendTelegram(
  admin: SupabaseClient,
  targets: PushTarget[],
  message: Message,
): Promise<TelegramResult> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const withChat = targets.filter((t) => typeof t.g === 'number');
  if (!token || withChat.length === 0) return { sent: 0, failed: 0, reached: new Set() };

  const deadChats: number[] = [];
  const reached = new Set<string>();
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < withChat.length; i += TELEGRAM_CONCURRENCY) {
    const chunk = withChat.slice(i, i + TELEGRAM_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (target) => {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: target.g,
            text: telegramMessageText(message, target.d),
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          }),
        });
        return { target, ok: res.ok, status: res.status, text: await res.text() };
      }),
    );
    for (const r of results) {
      if (r.ok) {
        sent++;
        reached.add(r.target.p);
      } else {
        failed++;
        if (isDeadChat(r.status, r.text)) deadChats.push(r.target.g as number);
      }
    }
  }

  if (deadChats.length > 0) {
    await admin.from('telegram_chats').delete().in('chat_id', deadChats);
  }
  return { sent, failed, reached };
}

// ─── System pings ─────────────────────────────────────────────────────────────

const AUTO_MESSAGES = {
  new_duty: {
    title: 'ورد جديد اليوم',
    body: 'أسند إليك المشرف ورداً جديداً لليوم — بارك الله فيك',
  },
  test: {
    title: 'إشعار تجريبي',
    body: 'الإشعارات تعمل على هذا الجهاز',
  },
} as const;

type AutoKind = keyof typeof AUTO_MESSAGES;

function isAutoKind(v: unknown): v is AutoKind {
  return typeof v === 'string' && v in AUTO_MESSAGES;
}

async function pushTargets(admin: SupabaseClient, profileIds: string[]): Promise<PushTarget[]> {
  if (profileIds.length === 0) return [];
  const { data, error } = await admin.rpc('push_targets', { p_profile_ids: profileIds });
  if (error) throw new Error(`push_targets: ${error.message}`);
  return (data ?? []) as PushTarget[];
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
    const role = decodeJwtRole(authHeader);
    let caller: { id: string; role: string; groupId: string | null } | null = null;

    if (role !== 'service_role') {
      // Interactive path: identify the caller through their own JWT.
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
        .select('role, group_id')
        .eq('id', user.id)
        .single();
      if (!profile) return json({ error: 'Invalid session' }, 401);
      caller = { id: user.id, role: profile.role, groupId: profile.group_id };
    }

    const payload = await req.json();
    const { campaignId, auto } = payload ?? {};
    if (!campaignId && !auto) return json({ error: 'campaignId or auto is required' }, 400);

    const saRaw = Deno.env.get('FCM_SERVICE_ACCOUNT');
    if (!saRaw) {
      return json({ error: 'FCM_SERVICE_ACCOUNT secret not configured' }, 500);
    }
    const sa: ServiceAccount = JSON.parse(saRaw);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── System ping path ──
    if (auto) {
      if (!isAutoKind(auto.kind)) return json({ error: 'Unknown auto kind' }, 400);

      let profileIds: string[];
      if (auto.kind === 'test') {
        // Anyone signed in may test their *own* devices — the "send a test" button in the
        // app. Never someone else's: that would be an unlogged broadcast.
        if (!caller) return json({ error: 'Not authorized' }, 403);
        profileIds = [caller.id];
      } else {
        // Only the database may fire duty pings. A dashboard session must go through a
        // campaign, otherwise it would gain an unlogged, unattributable broadcast.
        if (role !== 'service_role') return json({ error: 'Not authorized' }, 403);
        profileIds = Array.isArray(auto.profileIds) ? auto.profileIds : [];
      }

      const targets = await pushTargets(admin, profileIds);
      if (targets.length === 0) return json({ sent: 0, failed: 0, recipients: 0 });

      const text = AUTO_MESSAGES[auto.kind as AutoKind];
      const message: Message = {
        title: text.title,
        body: text.body,
        // One tag per kind: assigning three duties in a row should land as one standing
        // reminder (the latest, with the full day), not three identical banners.
        tag: `auto-${auto.kind}`,
        kind: auto.kind,
        showWird: true,
      };
      const accessToken = await getAccessToken(sa);
      const result = await sendToTargets(sa, accessToken, targets, message);
      // Duty pings are about the wird itself, so they mirror to Telegram alongside push.
      const tg = await sendTelegram(admin, targets, message);
      if (result.invalidTokens.length > 0) {
        await admin.from('fcm_tokens').delete().in('token', result.invalidTokens);
      }
      const reached = new Set([...result.reached, ...tg.reached]);
      return json({
        sent: result.sent + tg.sent,
        failed: result.failed + tg.failed,
        recipients: reached.size,
      });
    }

    // Dashboard sends: superadmin anything, a supervisor only their own group's campaigns.
    if (caller) {
      if (caller.role !== 'superadmin' && caller.role !== 'supervisor') {
        return json({ error: 'Not authorized' }, 403);
      }
      if (caller.role === 'supervisor') {
        const { data: owned } = await admin
          .from('notification_campaigns')
          .select('group_id')
          .eq('id', campaignId)
          .single();
        if (!owned || !caller.groupId || owned.group_id !== caller.groupId) {
          return json({ error: 'Not authorized' }, 403);
        }
      }
    }

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
        'id, title, body, audience, target_profile_id, schedule_kind, recur_weekday, recur_time, telegram',
      )
      .single();

    if (claimError || !campaign) {
      return json({ skipped: true, reason: 'already-dispatched-or-not-due' });
    }

    let sent = 0;
    let failed = 0;
    let targetCount = 0;
    let recipients = 0;
    let errorMessage: string | null = null;

    try {
      // Audience → profiles in SQL (campaign_profile_ids), including the "today in Damascus"
      // resolution for incomplete_today and the group scope. Returned as one array, not a set,
      // so PostgREST's max-rows cap cannot silently drop recipients.
      const { data: ids, error: idsError } = await admin.rpc('campaign_profile_ids', {
        p_campaign_id: campaign.id,
      });
      if (idsError) throw new Error(`campaign_profile_ids: ${idsError.message}`);
      const profileIds = (ids ?? []) as string[];
      targetCount = profileIds.length;

      const targets = await pushTargets(admin, profileIds);
      if (targets.length > 0) {
        const message: Message = {
          title: campaign.title,
          body: campaign.body,
          tag: `campaign-${campaign.id}`,
          kind: 'campaign',
          // A "you haven't finished today" reminder is about the wird itself — show it.
          showWird: campaign.audience === 'incomplete_today',
        };
        const accessToken = await getAccessToken(sa);
        const result = await sendToTargets(sa, accessToken, targets, message);
        // Only campaigns flagged telegram (today: the seeded daily wird reminder) mirror
        // to Telegram; an authored motivational message stays push-only unless flipped.
        const tg = campaign.telegram
          ? await sendTelegram(admin, targets, message)
          : { sent: 0, failed: 0, reached: new Set<string>() };
        sent = result.sent + tg.sent;
        failed = result.failed + tg.failed;
        const reached = new Set([...result.reached, ...tg.reached]);
        recipients = reached.size;

        if (result.invalidTokens.length > 0) {
          await admin.from('fcm_tokens').delete().in('token', result.invalidTokens);
        }
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
    }

    // Stamp results. Recurring campaigns get their next occurrence; once/now are done
    // (next_run_at already null from the claim). Missing 'daily' here would let a daily rule
    // fire exactly once and then go quiet, which is indistinguishable from it working.
    const patch: Record<string, unknown> = {
      last_sent_at: new Date().toISOString(),
      last_sent_count: sent,
      last_failed_count: failed,
      last_target_count: targetCount,
      last_recipient_count: recipients,
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

    return json({ sent, failed, recipients, targets: targetCount, error: errorMessage });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
