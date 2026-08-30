-- Two automatic notifications about duties.
--
-- 1. Day start: a daily 08:00 (Damascus) ping to anyone who has an unfinished duty today.
--    This is a seeded campaign row, not code — same as the Friday reminder — so a supervisor
--    can retime or disable it from the dashboard without a deploy.
--
-- 2. Duty added later: a supervisor assigning a duty for *today* has missed the 08:00 window,
--    so the employee would otherwise not hear about it until tomorrow. A trigger notifies the
--    affected employees straight away.
--
-- The trigger sends a system ping ({ auto: … }) rather than creating a campaign row: these are
-- not authored, scheduled or disableable by anyone, and writing one campaign per assignment
-- would bury the supervisor's real campaigns under machine noise.

-- ─── 1. Day-start reminder ────────────────────────────────────────────────────

insert into public.notification_campaigns
  (created_by, title, body, audience, schedule_kind, recur_time)
values
  (
    null,
    'ورد اليوم',
    'لديك ورد لم يكتمل بعد لهذا اليوم — تقبّل الله منك',
    'incomplete_today',
    'daily',
    '08:00'
  );

-- ─── 2. Duty assigned during the day ─────────────────────────────────────────

create or replace function public.notify_new_duties()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_ids uuid[];
begin
  -- Only duties that are actionable *now*. A duty assigned for next week is not news the
  -- employee can act on, and they cannot even see future days in the app.
  select array_agg(distinct nd.employee_id) into v_ids
  from new_duties nd
  where nd.due_date = (now() at time zone 'Asia/Damascus')::date;

  if v_ids is null or cardinality(v_ids) = 0 then
    return null;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'wird_dispatch_key';

  -- Same one-time setup as the cron dispatcher; silence beats failing the INSERT that
  -- triggered us. Assigning duties must never break because push is unconfigured.
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

-- Statement-level with a transition table, not per-row: fanout_group_assignment() inserts one
-- duty per employee in a single statement, so a per-row trigger would fire one HTTP request
-- per employee for what is a single assignment.
create trigger trg_duties_notify_new
after insert on public.duties
referencing new table as new_duties
for each statement execute function public.notify_new_duties();
