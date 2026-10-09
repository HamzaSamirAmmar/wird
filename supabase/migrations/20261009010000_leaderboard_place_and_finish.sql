-- Leaderboard: return what the ranking is based on, so the board can explain itself.
--
-- The order (unchanged) is: had duties → exact day rate → completed-day volume → earlier
-- average wrap-up time → streak → name. Two of those were invisible in the app: the
-- average wrap-up time (the tiebreak that decides most of a group where everyone is at
-- 100%) and ties themselves (two people equal on every criterion still got different
-- numbers, ordered only by name). Two columns are added:
--
--   mean_finish_secs  the average wrap-up time across the window's completed days, in
--                     seconds after each day's Damascus midnight (null: none completed)
--   place             a tie-aware rank (1, 2, 2, 4…) over the ranking criteria only — the
--                     name orders rows but never separates places
--
-- Adding output columns changes the return type, so the function is dropped and
-- recreated (with its grant). Older clients read columns by name and ignore new ones.

drop function if exists public.group_leaderboard(date, date);

create function public.group_leaderboard(p_from date, p_to date)
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

grant execute on function public.group_leaderboard(date, date) to authenticated;
