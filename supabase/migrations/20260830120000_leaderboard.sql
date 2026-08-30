-- Leaderboard (employee PWA) + duty follow-up (supervisor dashboard).
--
-- Both surfaces are read models over `duties` / `duties.status` (which the
-- sync_duty_status() trigger already derives from the checklist). "Finished" == status 'completed'.
--
-- The employee RLS on `duties` is `employee_id = auth.uid() or is_supervisor()`, so an employee
-- cannot read a groupmate's rows directly. These aggregates are therefore exposed as
-- `security definer` RPCs that only ever return counts + names, scoped to the caller's own group
-- (leaderboard) or gated behind is_supervisor() (follow-up). No new RLS policies.

-- ─── Current streak ─────────────────────────────────────────────────────────
--
-- Consecutive most-recent days (ending at or before p_asof) where every duty due that day is
-- completed. Days with no duties assigned are simply absent — they neither extend nor break the
-- run. Scan is capped at 90 days back, so the returned value saturates there.

create or replace function public.employee_current_streak(
  p_employee_id uuid,
  p_asof date default current_date
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with by_day as (
    select d.due_date,
           bool_and(d.status = 'completed') as all_done
    from public.duties d
    where d.employee_id = p_employee_id
      and d.due_date <= p_asof
      and d.due_date > p_asof - 90
    group by d.due_date
  ),
  ranked as (
    select all_done, row_number() over (order by due_date desc) as rn
    from by_day
  ),
  first_gap as (
    select min(rn) as rn from ranked where not all_done
  )
  select coalesce(
    (
      select count(*)
      from ranked, first_gap
      where first_gap.rn is null or ranked.rn < first_gap.rn
    ),
    0
  )::int;
$$;

-- ─── Group leaderboard (PWA) ────────────────────────────────────────────────
--
-- Ranks the caller's own group. Ordering: completion rate, then streak, then completed volume,
-- then name. Employees with nothing assigned in the window sort last with rate 0.

create or replace function public.group_leaderboard(p_from date, p_to date)
returns table (
  employee_id uuid,
  full_name text,
  assigned_count int,
  completed_count int,
  completion_rate numeric,
  current_streak int,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select p.group_id into v_group_id
  from public.profiles p
  where p.id = auth.uid();

  -- No profile, or a supervisor with no group: nothing to rank here.
  if v_group_id is null then
    return;
  end if;

  return query
  select
    p.id,
    p.full_name,
    count(d.id)::int,
    (count(d.id) filter (where d.status = 'completed'))::int,
    coalesce(
      round(
        (count(d.id) filter (where d.status = 'completed'))::numeric
          / nullif(count(d.id), 0),
        3
      ),
      0
    ),
    public.employee_current_streak(p.id),
    (p.id = auth.uid())
  from public.profiles p
  left join public.duties d
    on d.employee_id = p.id
    and d.due_date between p_from and p_to
  where p.role = 'employee'
    and p.is_active = true
    and p.group_id = v_group_id
  group by p.id, p.full_name
  order by 5 desc, 6 desc, 4 desc, 2;
end;
$$;

-- ─── Duty follow-up (dashboard) ────────────────────────────────────────────
--
-- Per-employee rollup over an arbitrary date range, optionally filtered to one group.
-- Supervisor-only. Sorted worst-first (lowest completion rate) — the supervisor is hunting gaps.

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
begin
  if not public.is_supervisor() then
    raise exception 'not authorized';
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
    and (p_group_id is null or p.group_id = p_group_id)
  group by p.id, p.full_name, p.group_id, g.name
  order by 10 asc, 2;
end;
$$;

-- Explicit grants double as the PostgREST exposure switch (auto_expose_new_tables is unset).
grant execute on function public.employee_current_streak(uuid, date) to authenticated;
grant execute on function public.group_leaderboard(date, date) to authenticated;
grant execute on function public.duty_followup(date, date, uuid) to authenticated;
