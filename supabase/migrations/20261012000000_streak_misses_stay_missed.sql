-- A missed day breaks the streak for good: finishing it later does not give the streak back.
--
-- employee_current_streak counted a day as complete whenever all its duties were `completed`,
-- whenever that happened. The PWA lets an employee open the last 30 days, so a day that was
-- missed (streak reset) and then ticked off a day or two later became "complete" again and the
-- old streak came straight back.
--
-- A day now keeps the streak only if it was finished ON that day (Damascus): every duty
-- completed, and the day's last step tick (completed_at, stamped by the server) no later than
-- the due date. A day finished late is a miss like an unfinished one — it breaks the streak
-- and stays broken. Ticks without a completed_at (from before it was stamped) count as on
-- time, so existing streaks are not cut by data that cannot say otherwise.
--
-- Only the streak changes. The window's completed-day count and rate (what ranks the board)
-- still count a late-finished day as completed. Signature and return shape are unchanged.

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
  duty_tick as (
    select
      dt.due_date,
      dt.status,
      (select max(dsp.completed_at)
         from public.duty_step_progress dsp
        where dsp.duty_id = dt.id and dsp.is_completed) as last_tick
    from public.duties dt, asof
    where dt.employee_id = p_employee_id
      and dt.due_date <= asof.d
  ),
  by_day as (
    -- One row per day that had duties: kept only when every duty that day was finished on it.
    select
      due_date,
      bool_and(
        status = 'completed'
        and (last_tick is null
             or (last_tick at time zone 'Asia/Damascus')::date <= due_date)
      ) as all_done
    from duty_tick
    group by due_date
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
