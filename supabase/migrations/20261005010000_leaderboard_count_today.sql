-- Leaderboard: every day in the window counts, today included.
--
-- 20261005000000 left the window's last day (today) out of the 7/30-day rate until it was
-- finished, so someone with 6 days who had finished 5 showed 5/5 = 100% instead of 5/6.
-- That is not the rule: the board must show every assigned day, and a day earns credit only
-- when EVERY duty due that day (all categories, as one daily wird) is completed. This
-- restores group_leaderboard to that behaviour (as in 20261004000000).
--
-- The streak change from 20261005000000 stays: an unfinished today does not break the
-- streak (it is still counted in days assigned, and earns nothing until finished).

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
  with day_rollup as (
    -- One row per employee per day: a day is complete only when every duty
    -- due that day (all categories) is completed.
    select
      d.employee_id,
      d.due_date,
      count(*) as day_assigned,
      count(*) filter (where d.status = 'completed') as day_completed
    from public.duties d
    where d.due_date between p_from and p_to
    group by d.employee_id, d.due_date
  ),
  per_employee as (
    select
      dr.employee_id,
      count(*) as days_assigned,
      count(*) filter (where dr.day_assigned = dr.day_completed) as days_completed,
      -- Exact rate (unrounded) — this is what ordering compares; the returned
      -- column below is rounded only for display.
      count(*) filter (where dr.day_assigned = dr.day_completed)::numeric
        / count(*) as exact_rate
    from day_rollup dr
    group by dr.employee_id
  ),
  emp_wrapup as (
    -- When the employee finished the last step of their latest fully-completed
    -- day: only step ticks, never duty-row updates.
    select
      dr.employee_id,
      max(dsp.completed_at) as last_finished_at
    from day_rollup dr
    join public.duties d
      on d.employee_id = dr.employee_id
     and d.due_date = dr.due_date
    join public.duty_step_progress dsp
      on dsp.duty_id = d.id
     and dsp.is_completed = true
    where dr.day_assigned = dr.day_completed
    group by dr.employee_id
  )
  select
    p.id,
    p.full_name,
    coalesce(pe.days_assigned, 0)::int,
    coalesce(pe.days_completed, 0)::int,
    coalesce(round(pe.exact_rate, 3), 0),
    public.employee_current_streak(p.id, p_to),
    (p.id = auth.uid())
  from public.profiles p
  left join per_employee pe on pe.employee_id = p.id
  left join emp_wrapup ew on ew.employee_id = p.id
  where p.role = 'employee'
    and p.is_active = true
    and p.group_id = v_group_id
  order by
    (coalesce(pe.days_assigned, 0) > 0) desc,   -- 1. Employees with duties in the window first
    coalesce(pe.exact_rate, 0) desc,            -- 2. Exact day-completion rate
    coalesce(pe.days_completed, 0) desc,        -- 3. Completed-day volume
    ew.last_finished_at asc nulls last,         -- 4. Wrapped up earlier
    6 desc,                                     -- 5. Current streak (as of p_to)
    2 asc;                                      -- 6. Full name (deterministic fallback)
end;
$$;
