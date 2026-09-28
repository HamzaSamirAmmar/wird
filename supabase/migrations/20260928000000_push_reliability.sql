-- Push reliability + group-scoped campaigns.
--
-- 1. Device-aware tokens. One device must hold exactly one live token, owned by whoever is
--    logged in on it now. Before this, a device could keep several valid tokens (rotation,
--    re-subscribe, browser + installed app) and every send landed once per token — the
--    "received twice" bug. And a phone passed between accounts could never re-register: the
--    token row belonged to the previous profile, so the RLS-guarded upsert was refused and the
--    old owner kept receiving the new owner's reminders.
--
-- 2. Push payloads carry the recipient's duties for today, so the service worker can write
--    them straight into the offline cache and the notification opens onto a working checklist
--    with no network. The snapshot is built here, per profile, in one round trip.
--
-- 3. Supervisors may send campaigns to their own group (notification_campaigns.group_id).
--    Superadmins keep global campaigns (group_id null) and can also target a single group.
--
-- 4. push_coverage(): who has a working device, so admins can see who will not be reached.

-- ─── 1. Device-aware tokens ────────────────────────────────────────────────────────────────

alter table public.fcm_tokens
  add column device_id text,
  add column platform text,
  add column standalone boolean not null default false,
  add column user_agent text;

create index idx_fcm_tokens_device_id on public.fcm_tokens (device_id);

-- The only write path for the app. Security definer because the token may currently belong to
-- another profile (shared phone), which RLS would — correctly — not let the caller touch.
create or replace function public.register_push_token(
  p_token text,
  p_device_id text,
  p_platform text default null,
  p_standalone boolean default false,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Every other token this device ever registered is superseded: the device has one push
  -- subscription at a time, so an older token is at best a duplicate and at worst another
  -- account's leftovers.
  if p_device_id is not null then
    delete from public.fcm_tokens where device_id = p_device_id and token <> p_token;
  end if;

  insert into public.fcm_tokens (token, profile_id, device_id, platform, standalone, user_agent)
  values (p_token, auth.uid(), p_device_id, p_platform, coalesce(p_standalone, false), left(p_user_agent, 300))
  on conflict (token) do update set
    profile_id = excluded.profile_id,
    device_id = excluded.device_id,
    platform = excluded.platform,
    standalone = excluded.standalone,
    user_agent = excluded.user_agent,
    last_seen_at = now();
end;
$$;

-- Logout: this device stops receiving for the caller.
create or replace function public.unregister_push_device(p_device_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.fcm_tokens where device_id = p_device_id and profile_id = auth.uid();
$$;

revoke execute on function public.register_push_token(text, text, text, boolean, text) from public, anon;
revoke execute on function public.unregister_push_device(text) from public, anon;
grant execute on function public.register_push_token(text, text, text, boolean, text) to authenticated;
grant execute on function public.unregister_push_device(text) to authenticated;

-- The app re-registers on every open, so a token unseen for 60 days belongs to a device that
-- is gone. FCM would eventually answer UNREGISTERED, but only after we keep sending to it.
select cron.schedule(
  'wird-push-prune',
  '17 3 * * *',
  $$delete from public.fcm_tokens where last_seen_at < now() - interval '60 days';$$
);

-- ─── 2. Campaigns: group scope + delivery stats ────────────────────────────────────────────

alter table public.notification_campaigns
  add column group_id uuid references public.groups (id) on delete cascade,
  add column last_target_count int,
  add column last_recipient_count int,
  add column last_failed_count int;

alter table public.notification_campaigns drop constraint notification_campaigns_audience_check;
alter table public.notification_campaigns
  add constraint notification_campaigns_audience_check
  check (audience in ('all', 'group', 'user', 'incomplete_today'));

alter table public.notification_campaigns
  add constraint campaign_group_requires_group check (audience <> 'group' or group_id is not null);

create index idx_notification_campaigns_group_id on public.notification_campaigns (group_id);

-- True when p_profile_id is in the caller's own group (a supervisor's reach for 'user').
create or replace function public.in_caller_group(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_profile_id and group_id = public.caller_group_id()
  );
$$;

drop policy notification_campaigns_all on public.notification_campaigns;

create policy notification_campaigns_superadmin on public.notification_campaigns
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- A supervisor owns campaigns for their one group. 'all' is not theirs to send; 'user' must
-- target someone inside the group.
create policy notification_campaigns_supervisor on public.notification_campaigns
  for all
  using (public.is_supervisor() and group_id = public.caller_group_id())
  with check (
    public.is_supervisor()
    and group_id = public.caller_group_id()
    and audience in ('group', 'user', 'incomplete_today')
    and (audience <> 'user' or public.in_caller_group(target_profile_id))
  );

-- ─── 3. Recipient resolution + duty snapshots (service role only) ──────────────────────────
-- Both return a single scalar (array / jsonb) rather than a set: PostgREST caps set-returning
-- RPCs at max-rows (1000), which would silently drop recipients in a large workplace.

create or replace function public.campaign_profile_ids(p_campaign_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select * from public.notification_campaigns where id = p_campaign_id
  ),
  today as (
    select (now() at time zone 'Asia/Damascus')::date as d
  )
  select coalesce(array_agg(distinct p.id), '{}')
  from c
  cross join today
  join public.profiles p on p.is_active
  where (c.group_id is null or p.group_id = c.group_id)
    and case c.audience
      when 'all' then true
      when 'group' then true
      when 'user' then p.id = c.target_profile_id
      when 'incomplete_today' then exists (
        select 1 from public.duties d
        where d.employee_id = p.id and d.due_date = today.d and d.status <> 'completed'
      )
      else false
    end;
$$;

-- For each profile: its live device tokens and a compact snapshot of today's duties.
--   [{ "p": profile_id, "t": [tokens], "d": [duty, …] }]
-- duty = { "i": id, "c": category, "s": [surahFrom, ayahFrom, surahTo, ayahTo], "n": note,
--          "t": status, "x": [[stepId, stepKey, stepOrder, done], …] }
-- Keys are one letter on purpose: web push payloads are capped at 4 KB.
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
  where exists (select 1 from public.fcm_tokens ft where ft.profile_id = r.id);
$$;

revoke execute on function public.campaign_profile_ids(uuid) from public, anon, authenticated;
revoke execute on function public.push_targets(uuid[]) from public, anon, authenticated;
grant execute on function public.campaign_profile_ids(uuid) to service_role;
grant execute on function public.push_targets(uuid[]) to service_role;

-- ─── 4. Coverage: who can actually be reached ──────────────────────────────────────────────

create or replace function public.push_coverage(p_group_id uuid default null)
returns table (
  profile_id uuid,
  full_name text,
  group_id uuid,
  device_count int,
  platforms text[],
  installed boolean,
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
