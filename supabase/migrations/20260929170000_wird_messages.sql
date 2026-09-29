-- The wird messages leave the dashboard and become code: three fixed messages whose wording
-- lives in supabase/functions/push-notifications/wird-templates.ts.
--
--   message   when (Damascus)                        to
--   ────────  ─────────────────────────────────────  ───────────────────────────────────
--   morning   04:00 (cron 01:00 UTC)                 every employee with a wird today
--   evening   20:00 (cron 17:00 UTC)                 every employee not finished today
--   updated   ~1 min after today's wird is added or  the employees whose wird changed
--             changed, from 04:00 to midnight
--
-- Everything goes out on both channels (push + Telegram). Dashboard campaigns stay for
-- anything else an admin wants to send, as free text without the wird.

-- ─── 1. The dashboard wird campaigns go away ─────────────────────────────────

delete from public.notification_campaigns
where created_by is null
  and schedule_kind = 'daily'
  and title in ('ورد اليوم', 'ورد اليوم لم يكتمل');

-- ─── 2. push_targets carries the name for {{name}} ───────────────────────────

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
    select p.id, p.full_name
    from public.profiles p
    where p.id = any (p_profile_ids) and p.is_active
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'p', r.id,
    'n', r.full_name,
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

-- ─── 3. Who gets the morning / evening message ───────────────────────────────

create or replace function public.wird_recipient_ids(p_kind text)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.id), '{}')
  from public.profiles p
  join public.duties d
    on d.employee_id = p.id
   and d.due_date = (now() at time zone 'Asia/Damascus')::date
  where p.is_active
    and p.role = 'employee'
    and (p_kind = 'morning' or (p_kind = 'evening' and d.status <> 'completed'));
$$;

revoke execute on function public.wird_recipient_ids(text) from public, anon, authenticated;
grant execute on function public.wird_recipient_ids(text) to service_role;

-- ─── 4. Run log + once-a-day claim ───────────────────────────────────────────
--
-- Every real send is logged here (dry runs are not). morning/evening have one row per day:
-- the edge function claims it before sending, so a cron retry or a racing tick cannot send
-- the day twice. A run that errored, or that has been in flight for 10 minutes (the function
-- died), can be claimed again by the next tick — the crons tick three times (:00 :15 :30)
-- for exactly that.

create table public.wird_runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('morning', 'evening', 'updated')),
  run_date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  attempts int not null default 1,
  target_count int,
  recipient_count int,
  push_sent int,
  push_failed int,
  telegram_sent int,
  telegram_failed int,
  error text
);

create unique index wird_runs_once_a_day
  on public.wird_runs (kind, run_date)
  where kind <> 'updated';

alter table public.wird_runs enable row level security;

create policy wird_runs_superadmin on public.wird_runs
  for select using (public.is_superadmin());

create or replace function public.claim_wird_run(p_kind text, p_target_count int)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Damascus')::date;
  v_id bigint;
begin
  if p_kind = 'updated' then
    insert into public.wird_runs (kind, run_date, target_count)
    values (p_kind, v_day, p_target_count)
    returning id into v_id;
    return v_id;
  end if;

  insert into public.wird_runs (kind, run_date, target_count)
  values (p_kind, v_day, p_target_count)
  on conflict (kind, run_date) where kind <> 'updated' do update
    set started_at = now(),
        attempts = public.wird_runs.attempts + 1,
        target_count = excluded.target_count,
        error = null
    where public.wird_runs.finished_at is null
      and (public.wird_runs.error is not null
           or public.wird_runs.started_at < now() - interval '10 minutes')
  returning id into v_id;

  return v_id; -- null: today's run already went out, or is going out right now
end;
$$;

revoke execute on function public.claim_wird_run(text, int) from public, anon, authenticated;
grant execute on function public.claim_wird_run(text, int) to service_role;

-- ─── 5. SQL → edge function ──────────────────────────────────────────────────
--
-- pg_net's default 5 s timeout is shorter than a morning send to every employee on two
-- channels; give it two minutes so the response (and any error) is recorded.

create or replace function public.dispatch_wird(
  p_kind text,
  p_profile_ids uuid[] default null,
  p_dry_run boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'wird_dispatch_key';

  if v_key is null then
    raise warning 'dispatch_wird: vault secret wird_dispatch_key is missing';
    return null;
  end if;

  return net.http_post(
    url := 'https://rpvzxseygmsbvumkciil.supabase.co/functions/v1/push-notifications',
    body := jsonb_build_object(
      'wird', jsonb_strip_nulls(jsonb_build_object(
        'kind', p_kind,
        'profileIds', to_jsonb(p_profile_ids),
        'dryRun', p_dry_run
      ))
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function public.dispatch_wird(text, uuid[], boolean) from public, anon, authenticated;

-- ─── 6. "Today's wird changed" queue ─────────────────────────────────────────
--
-- The immediate new-duty ping is replaced. Adding or changing today's wird queues the
-- affected employees; flush_wird_updates() (every minute) sends once an employee's entry has
-- been quiet for 45 s. Saving a day touches one assignment per category, so without the
-- settle time Telegram would get one message per category.

drop trigger if exists trg_duties_notify_new on public.duties;
drop function if exists public.notify_new_duties();

create table public.wird_update_queue (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  queued_at timestamptz not null default now()
);

alter table public.wird_update_queue enable row level security;
-- No policies: only the triggers and flush_wird_updates() (security definer) touch it.

create or replace function public.queue_wird_update_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wird_update_queue (profile_id)
  select distinct n.employee_id
  from new_duties n
  where n.due_date = (now() at time zone 'Asia/Damascus')::date
  on conflict (profile_id) do update set queued_at = now();
  return null;
end;
$$;

-- Only a change to what the employee has to recite counts — not the status updates that
-- every tick causes (sync_duty_status), which would otherwise message on each tick.
create or replace function public.queue_wird_update_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wird_update_queue (profile_id)
  select distinct n.employee_id
  from new_duties n
  join old_duties o on o.id = n.id
  where n.due_date = (now() at time zone 'Asia/Damascus')::date
    and (n.category, n.due_date, n.scope_surah_from, n.scope_ayah_from,
         n.scope_surah_to, n.scope_ayah_to, n.scope_note)
        is distinct from
        (o.category, o.due_date, o.scope_surah_from, o.scope_ayah_from,
         o.scope_surah_to, o.scope_ayah_to, o.scope_note)
  on conflict (profile_id) do update set queued_at = now();
  return null;
end;
$$;

-- Statement-level with transition tables: fanout_group_assignment() and
-- propagate_group_assignment_update() touch one duty per employee in a single statement.
create trigger trg_duties_queue_wird_insert
after insert on public.duties
referencing new table as new_duties
for each statement execute function public.queue_wird_update_insert();

create trigger trg_duties_queue_wird_change
after update on public.duties
referencing old table as old_duties new table as new_duties
for each statement execute function public.queue_wird_update_change();

create or replace function public.flush_wird_updates()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_morning timestamptz :=
    (((now() at time zone 'Asia/Damascus')::date + time '04:00') at time zone 'Asia/Damascus');
  v_ids uuid[];
begin
  -- Changes made before today's 04:00 are covered by the morning message (and anything left
  -- over from yesterday is moot).
  delete from public.wird_update_queue where queued_at < v_morning;

  with due as (
    delete from public.wird_update_queue
    where queued_at <= now() - interval '45 seconds'
    returning profile_id
  )
  select array_agg(profile_id) into v_ids from due;

  if v_ids is not null then
    perform public.dispatch_wird('updated', v_ids);
  end if;
end;
$$;

revoke execute on function public.flush_wird_updates() from public, anon, authenticated;

-- ─── 7. Schedules (pg_cron runs in UTC; Damascus is a fixed +03) ─────────────

select cron.schedule('wird-morning', '0,15,30 1 * * *', $$select public.dispatch_wird('morning');$$);
select cron.schedule('wird-evening', '0,15,30 17 * * *', $$select public.dispatch_wird('evening');$$);
select cron.schedule('wird-updates', '* * * * *', $$select public.flush_wird_updates();$$);
