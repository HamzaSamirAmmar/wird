-- Telegram as a second delivery channel for duty notifications.
--
-- A Telegram bot cannot message a user first: delivery needs a chat_id, which only exists
-- after the user opens the bot and taps Start. The supervisor stores each employee's
-- Telegram username (profiles.telegram_username); when the employee starts the bot, the
-- telegram-webhook edge function matches that username and remembers the chat_id in
-- telegram_chats — the address Telegram actually delivers to. The username is only the
-- matching key: once linked, the chat_id keeps working even if the user renames their
-- Telegram account.

-- ─── 1. The supervisor-provided matching key ─────────────────────────────────

alter table public.profiles
  add column telegram_username text;

-- Normalized form: lowercase, no leading '@'. Telegram usernames are case-insensitive,
-- so the webhook match is a plain equality.
alter table public.profiles
  add constraint profiles_telegram_username_format
  check (telegram_username is null or telegram_username ~ '^[a-z0-9_]{5,32}$');

create unique index idx_profiles_telegram_username
  on public.profiles (telegram_username)
  where telegram_username is not null;

-- ─── 2. Linked chats ─────────────────────────────────────────────────────────

create table public.telegram_chats (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  chat_id bigint not null unique,
  -- What Telegram reported at link time; informational only (users rename freely).
  telegram_username text,
  linked_at timestamptz not null default now()
);

alter table public.telegram_chats enable row level security;

create policy telegram_chats_own on public.telegram_chats
  for select using (profile_id = auth.uid());

create policy telegram_chats_supervisor on public.telegram_chats
  for select using (
    public.is_supervisor()
    and exists (
      select 1 from public.profiles p
      where p.id = telegram_chats.profile_id and p.group_id = public.caller_group_id()
    )
  );

create policy telegram_chats_superadmin on public.telegram_chats
  for select using (public.is_superadmin());

-- No app-role write policies: rows are only ever written by link_telegram_chat below,
-- called with the service-role key from the telegram-webhook edge function.

-- One account per chat and one chat per account (PK + unique chat_id). A chat previously
-- linked to someone else (a shared phone) is reassigned — exactly like register_push_token
-- reassigns a device: whoever last pressed Start owns the chat.
create or replace function public.link_telegram_chat(p_chat_id bigint, p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_username text := lower(regexp_replace(coalesce(p_username, ''), '^@+', ''));
begin
  select id into v_profile_id
  from public.profiles
  where is_active and telegram_username = v_username
  limit 1;

  if v_profile_id is null then
    return null;
  end if;

  delete from public.telegram_chats
  where chat_id = p_chat_id and profile_id <> v_profile_id;

  insert into public.telegram_chats (profile_id, chat_id, telegram_username)
  values (v_profile_id, p_chat_id, v_username)
  on conflict (profile_id) do update set
    chat_id = excluded.chat_id,
    telegram_username = excluded.telegram_username,
    linked_at = now();

  return v_profile_id;
end;
$$;

revoke execute on function public.link_telegram_chat(bigint, text) from public, anon, authenticated;
grant execute on function public.link_telegram_chat(bigint, text) to service_role;

-- ─── 3. Delivery plumbing ────────────────────────────────────────────────────

-- Per-campaign opt-in. For now only the seeded daily 08:00 wird reminder carries it;
-- flipping another row later needs no deploy.
alter table public.notification_campaigns
  add column telegram boolean not null default false;

update public.notification_campaigns
set telegram = true
where audience = 'incomplete_today'
  and schedule_kind = 'daily'
  and title = 'ورد اليوم';

-- push_targets gains 'g' (the telegram chat_id) per profile, and no longer drops profiles
-- without an fcm token: a telegram-only employee (e.g. iOS Safari without install) is
-- still a recipient — the FCM loop simply finds no tokens for them.
create or replace function public.push_targets(p_profile_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with today as (
    select (now() at time zone 'Asia/Damascus')::date as d
  ),
  recipients as (
    select p.id
    from public.profiles p
    where p.id = any (p_profile_ids) and p.is_active
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'p', r.id,
    't', (select jsonb_agg(ft.token) from public.fcm_tokens ft where ft.profile_id = r.id),
    'g', (select tc.chat_id from public.telegram_chats tc where tc.profile_id = r.id),
    'd', coalesce((
      select jsonb_agg(jsonb_build_object(
        'i', d.id,
        'c', d.category,
        's', jsonb_build_array(d.scope_surah_from, d.scope_ayah_from, d.scope_surah_to, d.scope_ayah_to),
        'n', left(d.scope_note, 120),
        't', d.status,
        'x', coalesce((
          select jsonb_agg(jsonb_build_array(s.id, s.step_key, s.step_order, s.is_completed) order by s.step_order)
          from public.duty_step_progress s
          where s.duty_id = d.id
        ), '[]'::jsonb)
      ) order by d.category)
      from public.duties d, today
      where d.employee_id = r.id and d.due_date = today.d
    ), '[]'::jsonb)
  )), '[]'::jsonb)
  from recipients r
  where exists (select 1 from public.fcm_tokens ft where ft.profile_id = r.id)
     or exists (select 1 from public.telegram_chats tc where tc.profile_id = r.id);
$$;

revoke execute on function public.push_targets(uuid[]) from public, anon, authenticated;
grant execute on function public.push_targets(uuid[]) to service_role;

-- ─── 4. Coverage: a telegram-linked employee is reachable without a device ───

-- Drop first: the return type gains a column, and Postgres refuses to change the return
-- type of an existing function via create or replace.
drop function if exists public.push_coverage(uuid);

create or replace function public.push_coverage(p_group_id uuid default null)
returns table (
  profile_id uuid,
  full_name text,
  group_id uuid,
  device_count int,
  platforms text[],
  installed boolean,
  telegram boolean,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_group_id uuid := p_group_id;
begin
  if not (public.is_supervisor() or public.is_superadmin()) then
    raise exception 'not authorized';
  end if;

  -- Same rule as duty_followup: a supervisor only ever sees their own group.
  if public.is_supervisor() and not public.is_superadmin() then
    v_group_id := public.caller_group_id();
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.group_id,
    count(ft.token)::int,
    coalesce(array_agg(distinct ft.platform) filter (where ft.platform is not null), '{}'),
    coalesce(bool_or(ft.standalone), false),
    exists (select 1 from public.telegram_chats tc where tc.profile_id = p.id),
    max(ft.last_seen_at)
  from public.profiles p
  left join public.fcm_tokens ft on ft.profile_id = p.id
  where p.role = 'employee'
    and p.is_active
    and (v_group_id is null or p.group_id = v_group_id)
  group by p.id, p.full_name, p.group_id
  order by count(ft.token) = 0 desc, p.full_name;
end;
$$;

revoke execute on function public.push_coverage(uuid) from public, anon;
grant execute on function public.push_coverage(uuid) to authenticated;
