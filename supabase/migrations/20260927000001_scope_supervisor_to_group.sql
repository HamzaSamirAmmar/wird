-- Splits the old, global "supervisor" role into two:
--   - superadmin: unchanged global access (today's supervisor behavior).
--   - supervisor: scoped to exactly one group (employees, duty assignments, follow-up,
--     leaderboard for that group only). Banners and push campaigns stay superadmin-only.
--
-- The only supervisor row that exists today is the seeded bootstrap account, which this
-- promotes to superadmin so nothing loses access on migration day.

-- ─── Constraint: employees and supervisors both require a group; only superadmin may not ──────
-- Old constraint dropped first (it doesn't know about 'superadmin'), then the data migration
-- runs unconstrained, then the new constraint is added — validated only after promotion, so the
-- still-null-group supervisor row is already 'superadmin' by the time it's checked.

alter table public.profiles drop constraint employee_requires_group;

update public.profiles set role = 'superadmin' where role = 'supervisor';

alter table public.profiles
  add constraint group_required_unless_superadmin check (role = 'superadmin' or group_id is not null);

-- ─── Helper functions ───────────────────────────────────────────────────────────────────────

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

create or replace function public.caller_group_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select group_id from public.profiles where id = auth.uid();
$$;

-- ─── groups: superadmin manages all; supervisor/employee only ever see their own ───────────────

drop policy groups_select on public.groups;
create policy groups_select on public.groups
  for select using (
    id = (select group_id from public.profiles where id = auth.uid())
    or public.is_superadmin()
  );

drop policy groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert with check (public.is_superadmin());

drop policy groups_update on public.groups;
create policy groups_update on public.groups
  for update using (public.is_superadmin());

drop policy groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete using (public.is_superadmin());

-- ─── profiles ───────────────────────────────────────────────────────────────────────────────
-- A supervisor may only touch employee rows in their own group — never another supervisor's or
-- superadmin's row, and never move/edit an employee outside their own group.

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or public.is_superadmin()
    or (public.is_supervisor() and group_id = public.caller_group_id())
  );

drop policy profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (
    public.is_superadmin()
    or (public.is_supervisor() and role = 'employee' and group_id = public.caller_group_id())
  );

drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (
    id = auth.uid()
    or public.is_superadmin()
    or (public.is_supervisor() and role = 'employee' and group_id = public.caller_group_id())
  )
  with check (
    id = auth.uid()
    or public.is_superadmin()
    or (public.is_supervisor() and role = 'employee' and group_id = public.caller_group_id())
  );

drop policy profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete using (
    public.is_superadmin()
    or (public.is_supervisor() and role = 'employee' and group_id = public.caller_group_id())
  );

-- ─── duty_group_assignments ─────────────────────────────────────────────────────────────────

drop policy duty_group_assignments_all on public.duty_group_assignments;
create policy duty_group_assignments_all on public.duty_group_assignments
  for all using (
    public.is_superadmin()
    or (public.is_supervisor() and group_id = public.caller_group_id())
  )
  with check (
    public.is_superadmin()
    or (public.is_supervisor() and group_id = public.caller_group_id())
  );

-- ─── duties: no direct group_id column, so scope through the employee's profile ────────────────

drop policy duties_select on public.duties;
create policy duties_select on public.duties
  for select using (
    employee_id = auth.uid()
    or public.is_superadmin()
    or (public.is_supervisor() and exists (
      select 1 from public.profiles p
      where p.id = duties.employee_id and p.group_id = public.caller_group_id()
    ))
  );

drop policy duties_insert on public.duties;
create policy duties_insert on public.duties
  for insert with check (
    public.is_superadmin()
    or (public.is_supervisor() and exists (
      select 1 from public.profiles p
      where p.id = duties.employee_id and p.group_id = public.caller_group_id()
    ))
  );

drop policy duties_update on public.duties;
create policy duties_update on public.duties
  for update using (
    public.is_superadmin()
    or (public.is_supervisor() and exists (
      select 1 from public.profiles p
      where p.id = duties.employee_id and p.group_id = public.caller_group_id()
    ))
  );

drop policy duties_delete on public.duties;
create policy duties_delete on public.duties
  for delete using (
    public.is_superadmin()
    or (public.is_supervisor() and exists (
      select 1 from public.profiles p
      where p.id = duties.employee_id and p.group_id = public.caller_group_id()
    ))
  );

-- ─── duty_step_progress: scope through duties -> profiles ──────────────────────────────────────

drop policy duty_step_progress_select on public.duty_step_progress;
create policy duty_step_progress_select on public.duty_step_progress
  for select using (
    duty_id in (select id from public.duties where employee_id = auth.uid())
    or public.is_superadmin()
    or (public.is_supervisor() and duty_id in (
      select d.id from public.duties d
      join public.profiles p on p.id = d.employee_id
      where p.group_id = public.caller_group_id()
    ))
  );

drop policy duty_step_progress_update on public.duty_step_progress;
create policy duty_step_progress_update on public.duty_step_progress
  for update using (
    duty_id in (select id from public.duties where employee_id = auth.uid())
    or public.is_superadmin()
    or (public.is_supervisor() and duty_id in (
      select d.id from public.duties d
      join public.profiles p on p.id = d.employee_id
      where p.group_id = public.caller_group_id()
    ))
  );

-- ─── banners, push: stay superadmin-only (global reminders / campaigns, not per-group) ─────────

drop policy banners_select on public.banners;
create policy banners_select on public.banners
  for select using (is_active = true or public.is_superadmin());

drop policy banners_insert on public.banners;
create policy banners_insert on public.banners
  for insert with check (public.is_superadmin());

drop policy banners_update on public.banners;
create policy banners_update on public.banners
  for update using (public.is_superadmin()) with check (public.is_superadmin());

drop policy banners_delete on public.banners;
create policy banners_delete on public.banners
  for delete using (public.is_superadmin());

drop policy fcm_tokens_select on public.fcm_tokens;
create policy fcm_tokens_select on public.fcm_tokens
  for select using (profile_id = auth.uid() or public.is_superadmin());

drop policy notification_campaigns_all on public.notification_campaigns;
create policy notification_campaigns_all on public.notification_campaigns
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- ─── duty_followup: allow supervisor, but force-scope to their own group ───────────────────────
-- group_leaderboard needs no change — it already resolves the caller's own group_id and returns
-- nothing when null, so a scoped supervisor now gets their own group's leaderboard for free.

create or replace function public.duty_followup(
  p_from date,
  p_to date,
  p_group_id uuid default null
)
returns table (
  employee_id uuid,
  full_name text,
  group_id uuid,
  group_name text,
  assigned_count int,
  completed_count int,
  incomplete_count int,
  days_assigned int,
  days_all_complete int,
  completion_rate numeric,
  current_streak int
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

  -- A group-scoped supervisor can only ever see their own group, regardless of what was passed.
  if public.is_supervisor() and not public.is_superadmin() then
    v_group_id := public.caller_group_id();
  end if;

  return query
  with day_rollup as (
    select d.employee_id as emp_id,
           d.due_date,
           count(*) as day_assigned,
           count(*) filter (where d.status = 'completed') as day_completed
    from public.duties d
    where d.due_date between p_from and p_to
    group by d.employee_id, d.due_date
  )
  select
    p.id,
    p.full_name,
    p.group_id,
    g.name,
    coalesce(sum(dr.day_assigned), 0)::int,
    coalesce(sum(dr.day_completed), 0)::int,
    coalesce(sum(dr.day_assigned - dr.day_completed), 0)::int,
    count(dr.due_date)::int,
    (count(dr.due_date) filter (where dr.day_assigned = dr.day_completed))::int,
    coalesce(
      round(sum(dr.day_completed)::numeric / nullif(sum(dr.day_assigned), 0), 3),
      0
    ),
    public.employee_current_streak(p.id)
  from public.profiles p
  join public.groups g on g.id = p.group_id
  left join day_rollup dr on dr.emp_id = p.id
  where p.role = 'employee'
    and p.is_active = true
    and (v_group_id is null or p.group_id = v_group_id)
  group by p.id, p.full_name, p.group_id, g.name
  order by 10 asc, 2;
end;
$$;
