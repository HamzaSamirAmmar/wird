-- Notifications rebuilt on top of the reset in 20260929120000:
--
--   what                     when (Damascus)   audience           channel
--   ───────────────────────  ────────────────  ─────────────────  ──────────────
--   morning wird             daily 04:00       incomplete_today   push + telegram
--   evening not-finished     daily 20:00       incomplete_today   push + telegram
--   new duty for today       on assignment     its employees      push + telegram
--   authored campaigns       as scheduled      as chosen          chosen per campaign
--
-- At 04:00 nobody has finished yet, so 'incomplete_today' is exactly "everyone with a wird
-- today" — and it still skips anyone who ticked everything off after midnight.

-- ─── 1. Per-campaign channel (replaces the telegram boolean) ─────────────────

alter table public.notification_campaigns
  add column channel text not null default 'push'
  check (channel in ('push', 'telegram', 'both'));

alter table public.notification_campaigns
  drop column telegram;

-- ─── 2. Resuming a paused recurring rule reschedules it ──────────────────────
--
-- next_run_at used to be recomputed only when the schedule columns changed. Pausing a daily
-- rule over its time and resuming it later left next_run_at in the past, so it fired within
-- five minutes of the resume, at the wrong hour. Only recurring rules are rescheduled on
-- resume: recomputing a spent 'once' or 'now' campaign would send it again.

create or replace function public.set_campaign_next_run()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or new.schedule_kind is distinct from old.schedule_kind
     or new.scheduled_at is distinct from old.scheduled_at
     or new.recur_weekday is distinct from old.recur_weekday
     or new.recur_time is distinct from old.recur_time
     or (new.is_active and not old.is_active and new.schedule_kind in ('daily', 'weekly'))
  then
    new.next_run_at := public.next_campaign_run(
      new.schedule_kind, new.scheduled_at, new.recur_weekday, new.recur_time
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_campaigns_next_run on public.notification_campaigns;
create trigger trg_campaigns_next_run
before insert or update of schedule_kind, scheduled_at, recur_weekday, recur_time, is_active
on public.notification_campaigns
for each row execute function public.set_campaign_next_run();

-- ─── 3. Dispatcher heals recurring rules left without a next run ─────────────
--
-- The edge function nulls next_run_at to claim a send and writes the next occurrence only
-- at the end. If it dies in between (timeout, crash), a daily rule would stay null — and
-- silent — forever. Each tick puts any such rule back on its next occurrence. That is
-- always in the future, so healing a rule that is mid-send cannot double-send it.

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
  update public.notification_campaigns
  set next_run_at = public.next_campaign_run(schedule_kind, null, recur_weekday, recur_time)
  where is_active
    and schedule_kind in ('daily', 'weekly')
    and next_run_at is null;

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
      body := jsonb_build_object('campaignId', r.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      )
    );
  end loop;
end;
$$;

select cron.schedule(
  'wird-push-dispatch',
  '*/5 * * * *',
  $$select public.dispatch_due_campaigns();$$
);

-- ─── 4. New-duty ping, quiet only before the 04:00 morning wird ──────────────
--
-- A duty assigned for today between 00:00 and 04:00 is about to be announced by the 04:00
-- morning wird; pinging now as well would double-ping. Any other hour pings immediately.

create or replace function public.notify_new_duties()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_ids uuid[];
  v_local_time time := (now() at time zone 'Asia/Damascus')::time;
begin
  if v_local_time < '04:00' then
    return null;
  end if;

  select array_agg(distinct nd.employee_id) into v_ids
  from new_duties nd
  where nd.due_date = (now() at time zone 'Asia/Damascus')::date;

  if v_ids is null or cardinality(v_ids) = 0 then
    return null;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'wird_dispatch_key';

  if v_key is null then
    return null;
  end if;

  perform net.http_post(
    url := 'https://rpvzxseygmsbvumkciil.supabase.co/functions/v1/push-notifications',
    body := jsonb_build_object(
      'auto', jsonb_build_object('kind', 'new_duty', 'profileIds', to_jsonb(v_ids))
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );

  return null;
end;
$$;

-- Statement-level with a transition table: fanout_group_assignment() inserts one duty per
-- employee in a single statement, so per-row would mean one HTTP request per employee.
create trigger trg_duties_notify_new
after insert on public.duties
referencing new table as new_duties
for each statement execute function public.notify_new_duties();

-- ─── 5. The two wird reminders ───────────────────────────────────────────────
--
-- Plain campaign rows: supervisors can see, pause, edit or delete them in the dashboard.

insert into public.notification_campaigns
  (created_by, title, body, audience, schedule_kind, recur_time, channel)
values
  (null, 'ورد اليوم', 'هذا وردك لليوم، أعانك الله عليه وتقبّل منك',
   'incomplete_today', 'daily', '04:00', 'both'),
  (null, 'ورد اليوم لم يكتمل', 'لديك ورد لم يكتمل بعد لهذا اليوم — تقبّل الله منك',
   'incomplete_today', 'daily', '20:00', 'both');
