-- Leaderboard: a day still in progress is not a failure yet.
--
-- Both read models measured "today" (the window's end) as if it were already over:
--   * employee_current_streak returned 0 every morning until the day's wird was finished —
--     a 20-day streak vanished at 04:00 and came back in the evening;
--   * group_leaderboard counted today's unfinished day in the denominator of the 7/30-day
--     rate, so everyone's percentage dropped overnight and the board reshuffled by who
--     happened to finish first, not by consistency.
--
-- Now the window's last day counts only once it is fully completed (finishing it still lifts
-- the rate and the streak immediately). The single-day window ("today") is unchanged: there
-- the in-progress day is the whole point. Signatures and return shapes are unchanged, so no
-- client change is required and database.types.ts stays as it is.

create or replace function public.employee_current_streak(
  p_employee_id uuid,
  p_asof date default ((now() at time zone 'Asia/Damascus')::date)
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
  -- The as-of day is still in progress until it is finished: skip it rather than let it
  -- break the streak.
  settled as (
    select * from by_day where not (due_date = p_asof and not all_done)
  ),
  ranked as (
    select all_done, row_number() over (order by due_date desc) as rn
    from settled
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
  with raw_rollup as (
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
  day_rollup as (
    -- Multi-day windows: the last day counts only once it is finished.
    select * from raw_rollup rr
    where p_from = p_to
       or rr.due_date < p_to
       or rr.day_assigned = rr.day_completed
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
