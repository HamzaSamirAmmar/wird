// Receives Telegram bot updates (registered via setWebhook → this function's URL).
//
// Its only job: when an employee opens t.me/<bot> and taps Start, match their Telegram
// username against profiles.telegram_username (entered by the supervisor in the
// dashboard) and remember the chat_id — the address Telegram actually delivers to.
// Bots cannot message a user first, so the Start tap is the one moment the mapping
// can be learned. Username matching is one-shot: after linking, delivery uses the
// permanent chat_id and a renamed Telegram account keeps receiving its wird.
//
// Requires secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (both set via
// `supabase secrets set`). The secret is passed to setWebhook and echoed back by
// Telegram in the X-Telegram-Bot-Api-Secret-Token header on every update.
//
// The repo convention: edge functions deploy as self-contained single files, so CORS
// headers are inlined rather than imported from ../_shared/cors.ts.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { username?: string };
  };
}

async function telegramReply(chatId: number, text: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      // The app's notifications are data-only on the push side for exactly one displayer;
      // here the bot is the one displayer, so plain text (no preview) is the equivalent.
      link_preview_options: { is_disabled: true },
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Anything that isn't a signed Telegram update gets nothing. This header check is the
  // whole authentication: no Supabase key, no JWT — Telegram is the only caller.
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (!secret || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const update = (await req.json()) as TelegramUpdate;
    const msg = update.message;
    const chatId = msg?.chat?.id;

    // Only private /start matters. The bot ignores groups, commands and everything else.
    if (typeof chatId === 'number' && msg?.chat?.type === 'private' && msg.text?.startsWith('/start')) {
      const username = String(msg.from?.username ?? '')
        .trim()
        .replace(/^@+/, '')
        .toLowerCase();

      if (!username) {
        await telegramReply(
          chatId,
          'حسابك في تيليجرام بلا معرف (@username).\nأضف معرفاً من إعدادات تيليجرام ثم أرسل /start من جديد.',
        );
      } else {
        const admin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const { data: profileId } = await admin.rpc('link_telegram_chat', {
          p_chat_id: chatId,
          p_username: username,
        });

        await telegramReply(
          chatId,
          profileId
            ? 'تمّ ربط حسابك بنجاح ✅\nسيصلك وردك اليومي هنا بإذن الله.'
            : 'هذا المعرف غير مسجّل لدينا.\nتواصل مع مشرفك لربط حسابك ثم أرسل /start من جديد.',
        );
      }
    }

    // Always 200 for a handled update: Telegram retries non-2xx with backoff, and the
    // only update we act on (/start) is idempotent anyway.
    return new Response('ok');
  } catch {
    // Let Telegram retry transient failures (DB hiccup, network) rather than losing
    // the one Start tap that links the employee.
    return new Response('error', { status: 500 });
  }
});
