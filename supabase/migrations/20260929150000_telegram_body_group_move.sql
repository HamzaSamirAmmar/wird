-- ─── 1. Telegram's own text ──────────────────────────────────────────────────
--
-- A campaign on both channels may carry a separate Telegram text (longer, richer than a
-- phone notification allows). Null = Telegram gets `body`, as before.

alter table public.notification_campaigns
  add column telegram_body text
  check (telegram_body is null or char_length(telegram_body) <= 2000);

-- ─── 2. Supervisors may use the assigned_today audience ──────────────────────
--
-- 20260929140000 added the audience to the table and the dashboard's supervisor list but
-- not to this policy, so a supervisor's insert or edit with it was refused.

drop policy notification_campaigns_supervisor on public.notification_campaigns;

create policy notification_campaigns_supervisor on public.notification_campaigns
  for all
  using (public.is_supervisor() and group_id = public.caller_group_id())
  with check (
    public.is_supervisor()
    and group_id = public.caller_group_id()
    and audience in ('group', 'user', 'assigned_today', 'incomplete_today')
    and (audience <> 'user' or public.in_caller_group(target_profile_id))
  );

-- ─── 3. Moving an employee to another group starts them fresh ────────────────
--
-- Previously a move kept every duty from the old group and only added the new group's.
-- Now a group change deletes all of the employee's duties (history included — their
-- checklists cascade) and issues the new group's duties for today and the days ahead.
-- The new duties for today fire the new-duty ping like any other assignment.
--
-- "Today" is the Damascus calendar day: current_date is the UTC day, which between 00:00
-- and 03:00 Damascus is still yesterday and would backfill a duty the PWA never shows.

create or replace function public.backfill_group_duties()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Damascus')::date;
begin
  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    delete from public.duties where employee_id = new.id;
  end if;

  if new.role <> 'employee' or new.group_id is null or new.is_active = false then
    return new;
  end if;

  insert into public.duties (
    employee_id, assigned_by, group_assignment_id, category, due_date,
    scope_surah_from, scope_ayah_from, scope_surah_to, scope_ayah_to, scope_note
  )
  select new.id, a.assigned_by, a.id, a.category, a.due_date,
         a.scope_surah_from, a.scope_ayah_from, a.scope_surah_to, a.scope_ayah_to, a.scope_note
  from public.duty_group_assignments a
  where a.group_id = new.group_id
    and a.due_date >= v_today
    -- Idempotent: never issue a second duty for an assignment this employee already holds,
    -- so re-activating or re-saving a profile is safe.
    and not exists (
      select 1
      from public.duties d
      where d.group_assignment_id = a.id
        and d.employee_id = new.id
    );

  return new;
end;
$$;
