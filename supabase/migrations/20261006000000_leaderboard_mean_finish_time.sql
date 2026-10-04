-- Leaderboard timing tiebreak: the AVERAGE finish time across the window, not the last tick.
--
-- Until now, two employees tied on rate and completed days were split by the latest step
-- tick on any completed day in the window — in practice, by who finished TODAY first. So
-- on the 7/30-day boards one early morning outweighed a whole week, and catching up a
-- missed day late pushed you to the bottom of the tie.
--
-- Now each fully-completed day gets a finish time (its last tick, as seconds after that
-- day's midnight, Damascus) and the tiebreak compares the arithmetic mean of those across
-- the window: A finishing before B on four days and after B on three normally ranks A
-- above B over 7 days. For the 1-day board it is still simply who finished today first.
-- Exact ties fall through to the current streak, then the name, as before.
--
-- Everything else is unchanged from 20261005010000 (same signature and columns).

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
  day_finish as (
    -- When each fully-completed day was wrapped up, as seconds after that day's own
    -- midnight in Damascus: its last step tick (completed_at is stamped server-side;
    -- ticks from before it existed fall back to the duty's updated_at). Finishing a day
    -- late (catching up the next morning) therefore counts as a late finish of THAT
    -- day, never as a late finish of today.
    select
      d.employee_id,
      d.due_date,
      extract(epoch from (
        max(coalesce(dsp.completed_at, d.updated_at)) at time zone 'Asia/Damascus'
        - d.due_date::timestamp
      )) as finish_secs
    from day_rollup dr
    join public.duties d
      on d.employee_id = dr.employee_id
     and d.due_date = dr.due_date
    join public.duty_step_progress dsp
      on dsp.duty_id = d.id
     and dsp.is_completed = true
    where dr.day_assigned = dr.day_completed
    group by d.employee_id, d.due_date
  ),
  emp_wrapup as (
    -- Arithmetic mean of those finish times across the window's completed days.
    select
      df.employee_id,
      avg(df.finish_secs) as mean_finish_secs
    from day_finish df
    group by df.employee_id
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
    ew.mean_finish_secs asc nulls last,         -- 4. Earlier average wrap-up time
    6 desc,                                     -- 5. Current streak (as of p_to)
    2 asc;                                      -- 6. Full name (deterministic fallback)
end;
$$;
