-- Leaderboard: day-based ranking + ordering fixes.
--
-- 1) The unit of achievement is now the DAY, all-or-nothing: with several duty
--    categories per day (new memorization / minor review / major review), a day
--    counts as completed only when EVERY duty due that day is completed. The
--    PWA board's assigned/completed counts are therefore days, not duties.
--    The supervisor follow-up (duty_followup) is untouched: it keeps showing
--    exactly which duties are finished and which are not.
-- 2) Ordering is now:
--       a. had any duties in the window (nothing-assigned sorts last),
--       b. exact (unrounded) day-completion rate desc,
--       c. completed-day volume desc,
--       d. wrapped up earlier (last completion tick of the latest full day) asc,
--       e. current streak desc — anchored to the window's end, Damascus calendar,
--       f. full name asc.
--    Previously the rounded-to-3-decimals rate was compared (so rows that looked
--    tied at whole percents were ordered invisibly) and the streak outranked the
--    completion-time tiebreak, making "who finished earlier" nearly unreachable.
-- 3) Step completion time is now stamped server-side on every completed step
--    (clients send it too, but old installed PWAs predate the column), legacy
--    NULLs are backfilled from duties.updated_at (≈ the moment the status-sync
--    trigger last fired for that duty), and the wrap-up tiebreak reads only
--    duty_step_progress.completed_at — never a duty-row update timestamp.
-- 4) employee_current_streak's anchor defaults to Asia/Damascus "today" (the
--    workplace calendar) instead of the DB server's UTC date, and
--    group_leaderboard pins it to p_to so streak and window measure the same day.

-- ─── Stamp completed_at server-side ─────────────────────────────────────────

create or replace function public.stamp_step_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.is_completed and new.completed_at is null then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

-- Runs after trg_keep_step_completed on is_completed updates (alphabetical):
-- a blocked untick keeps the original completed_at (possibly null for legacy
-- rows), which this trigger then fills — better a late timestamp than none.
create trigger trg_stamp_step_completed_at
before insert or update on public.duty_step_progress
for each row execute function public.stamp_step_completed_at();

-- Backfill: duties.updated_at is bumped by trg_duties_updated_at when
-- sync_duty_status writes the final 'completed', so for already-completed steps
-- it is the best available approximation of when the last tick happened.
update public.duty_step_progress dsp
set completed_at = d.updated_at
from public.duties d
where dsp.duty_id = d.id
  and dsp.is_completed
  and dsp.completed_at is null;

-- ─── Streak anchored to Damascus ────────────────────────────────────────────

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

-- ─── Day-based group leaderboard ────────────────────────────────────────────

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
