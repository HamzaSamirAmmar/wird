-- Leaderboard hardening: the server decides what "today" is, and the streak has no ceiling.
--
-- 1. The window's end came from the phone (`p_to` = the device's local date). A phone whose
--    clock or time zone runs ahead of Damascus asked for tomorrow: an already-assigned,
--    unfinished tomorrow then counted as a missed day (lower rate) and — as the streak's
--    as-of day — pushed today out of the "still in progress" grace, breaking streaks early.
--    Now a window that ends after today (Damascus) is shifted back to end today, keeping its
--    length; the streak's as-of day is clamped the same way. A future day can never count.
--
-- 2. employee_current_streak only looked back 90 days, so a streak could never show more
--    than 90. It now counts every completed day after the latest unfinished one, over the
--    whole history (days with nothing assigned neither break nor extend it, and an
--    unfinished as-of day is still pending, not a miss — both unchanged).
--
-- Signatures and return shapes are unchanged.

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
  with asof as (
    select least(p_asof, (now() at time zone 'Asia/Damascus')::date) as d
  ),
  by_day as (
    -- One row per day that had duties: complete only when every duty that day is.
    select dt.due_date, bool_and(dt.status = 'completed') as all_done
    from public.duties dt, asof
    where dt.employee_id = p_employee_id
      and dt.due_date <= asof.d
    group by dt.due_date
  ),
  settled as (
    -- The as-of day is still in progress until it is finished: skip it rather than let it
    -- break the streak.
    select b.* from by_day b, asof where not (b.due_date = asof.d and not b.all_done)
  ),
  last_miss as (
    select max(due_date) as d from settled where not all_done
  )
  select count(*)::int
  from settled s, last_miss m
  where s.all_done
    and (m.d is null or s.due_date > m.d);
$$;

create or replace function public.group_leaderboard(p_from date, p_to date)
returns table (
  employee_id uuid,
  full_name text,
  assigned_count int,
  completed_count int,
  completion_rate numeric,
  current_streak int,
  is_me boolean,
  mean_finish_secs numeric,
  place int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_today date := (now() at time zone 'Asia/Damascus')::date;
  v_shift int;
begin
  select p.group_id into v_group_id
  from public.profiles p
  where p.id = auth.uid();

  -- No profile, or a supervisor with no group: nothing to rank here.
  if v_group_id is null or p_from is null or p_to is null or p_from > p_to then
    return;
  end if;

  -- Never count a day after today (Damascus): a window ending in the future (a phone ahead
  -- of Damascus) is moved back to end today, keeping its length.
  v_shift := greatest(0, p_to - v_today);
  p_from := p_from - v_shift;
  p_to := p_to - v_shift;

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
    -- ticks from before it existed fall back to the duty's updated_at).
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
  ),
  board as (
    select
      p.id,
      p.full_name,
      coalesce(pe.days_assigned, 0)::int as days_assigned,
      coalesce(pe.days_completed, 0)::int as days_completed,
      coalesce(pe.exact_rate, 0) as exact_rate,
      public.employee_current_streak(p.id, p_to) as streak,
      (p.id = auth.uid()) as is_me,
      ew.mean_finish_secs
    from public.profiles p
    left join per_employee pe on pe.employee_id = p.id
    left join emp_wrapup ew on ew.employee_id = p.id
    where p.role = 'employee'
      and p.is_active = true
      and p.group_id = v_group_id
  )
  select
    b.id,
    b.full_name,
    b.days_assigned,
    b.days_completed,
    round(b.exact_rate, 3),
    b.streak,
    b.is_me,
    round(b.mean_finish_secs::numeric, 0),
    (rank() over (
      order by
        (b.days_assigned > 0) desc,
        b.exact_rate desc,
        b.days_completed desc,
        b.mean_finish_secs asc nulls last,
        b.streak desc
    ))::int
  from board b
  order by
    (b.days_assigned > 0) desc,           -- 1. Employees with duties in the window first
    b.exact_rate desc,                    -- 2. Exact day-completion rate
    b.days_completed desc,                -- 3. Completed-day volume
    b.mean_finish_secs asc nulls last,    -- 4. Earlier average wrap-up time
    b.streak desc,                        -- 5. Current streak (as of p_to)
    b.full_name asc;                      -- 6. Name (orders rows, never separates places)
end;
$$;
