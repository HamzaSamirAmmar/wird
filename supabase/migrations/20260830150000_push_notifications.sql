-- Push notifications (FCM web push).
--
-- Flow: PWA registers its FCM token in fcm_tokens. The dashboard writes notification_campaigns
-- rows. An edge function (supabase/functions/push-notifications) resolves the audience, sends via
-- FCM HTTP v1, and advances campaign state. pg_cron (every 5 min) + pg_net dispatch any campaign
-- whose next_run_at is due; the dispatcher authenticates with the service-role key stored in
-- Supabase Vault as secret 'wird_dispatch_key' (inserted out-of-band, never in git).

-- ─── Extensions ───────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ─── Tables ───────────────────────────────────────────────────────────────────

-- One row per device/browser push token. A profile may have many (phone + laptop).
create table public.fcm_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index idx_fcm_tokens_profile_id on public.fcm_tokens (profile_id);

create table public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id),
  title text not null,
  body text not null,
  audience text not null check (audience in ('all', 'user', 'incomplete_today')),
  target_profile_id uuid references public.profiles (id),
  schedule_kind text not null default 'now' check (schedule_kind in ('now', 'once', 'weekly')),
  scheduled_at timestamptz,
  recur_weekday smallint check (recur_weekday between 0 and 6), -- 0=Sunday … 5=Friday … 6=Saturday (matches Postgres dow and JS getDay)
  recur_time time,
  is_active boolean not null default true,
  next_run_at timestamptz,
  last_sent_at timestamptz,
  last_sent_count int,
  last_error text,
  created_at timestamptz not null default now(),
  constraint campaign_target_required check (audience <> 'user' or target_profile_id is not null),
  constraint campaign_once_requires_time check (schedule_kind <> 'once' or scheduled_at is not null),
  constraint campaign_weekly_requires_rule check (
    schedule_kind <> 'weekly'
    or (recur_weekday is not null and recur_time is not null)
  ),
  constraint campaign_now_requires_time check (schedule_kind <> 'now' or scheduled_at is null)
);

create index idx_notification_campaigns_due
  on public.notification_campaigns (next_run_at)
  where is_active and next_run_at is not null;

-- ─── Schedule maths ───────────────────────────────────────────────────────────
-- Recurrence times are wall-clock in Asia/Riyadh (fixed UTC+3, no DST), so plain
-- date arithmetic is exact.

create or replace function public.next_campaign_run(
  p_kind text,
  p_scheduled_at timestamptz,
  p_weekday smallint,
  p_time time,
  p_after timestamptz default now()
)
returns timestamptz
language sql
stable
as $$
  select case
    when p_kind = 'once' then p_scheduled_at
    when p_kind = 'weekly' then (
      with local_now as (
        select (p_after at time zone 'Asia/Riyadh')::timestamp as ts
      ),
      candidate as (
        select
          ((local_now.ts)::date
            + (((p_weekday - extract(dow from local_now.ts)::int) % 7) + 7) % 7
            + p_time) as local_dt
        from local_now
      )
      select case
        when (candidate.local_dt at time zone 'Asia/Riyadh') <= p_after
          then ((candidate.local_dt + interval '7 days') at time zone 'Asia/Riyadh')
        else (candidate.local_dt at time zone 'Asia/Riyadh')
      end
      from candidate
    )
    else null
  end;
$$;

create or replace function public.set_campaign_next_run()
returns trigger
language plpgsql
as $$
begin
  new.next_run_at := public.next_campaign_run(
    new.schedule_kind, new.scheduled_at, new.recur_weekday, new.recur_time
  );
  return new;
end;
$$;

create trigger trg_campaigns_next_run
before insert or update of schedule_kind, scheduled_at, recur_weekday, recur_time
on public.notification_campaigns
for each row execute function public.set_campaign_next_run();

-- ─── Dispatcher (pg_cron → edge function via pg_net) ─────────────────────────

create or replace function public.dispatch_due_campaigns()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  r record;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'wird_dispatch_key';

  if v_key is null then
    return; -- one-time setup not done yet; see AGENTS.md
  end if;

  for r in
    select id from public.notification_campaigns
    where is_active and next_run_at is not null and next_run_at <= now()
  loop
    perform net.http_post(
      url := 'https://rpvzxseygmsbvumkciil.supabase.co/functions/v1/push-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object('campaignId', r.id)::text
    );
  end loop;
end;
$$;

select cron.schedule(
  'wird-push-dispatch',
  '*/5 * * * *',
  $$select public.dispatch_due_campaigns();$$
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.fcm_tokens enable row level security;
alter table public.notification_campaigns enable row level security;

-- A user manages only their own device tokens; supervisors may see them (device counts).
create policy fcm_tokens_select on public.fcm_tokens
  for select using (profile_id = auth.uid() or public.is_supervisor());
create policy fcm_tokens_insert on public.fcm_tokens
  for insert with check (profile_id = auth.uid());
create policy fcm_tokens_update on public.fcm_tokens
  for update using (profile_id = auth.uid());
create policy fcm_tokens_delete on public.fcm_tokens
  for delete using (profile_id = auth.uid());

-- Campaigns are a supervisor-only surface; employees only ever receive the pushes.
create policy notification_campaigns_all on public.notification_campaigns
  for all using (public.is_supervisor()) with check (public.is_supervisor());

-- ─── Seed: weekly Friday-morning reminder ────────────────────────────────────

insert into public.notification_campaigns
  (created_by, title, body, audience, schedule_kind, recur_weekday, recur_time)
values
  (
    null,
    'تذكير بسنن يوم الجمعة',
    'قراءة سورة الكهف وغيرها من سنن يوم الجمعة، لا تنسَ وردك اليوم',
    'all',
    'weekly',
    5,
    '08:00'
  );
