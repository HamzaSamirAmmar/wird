-- Update group_leaderboard to rank by completion time (who finished earlier)
-- when completion rate, streak, and completed count are tied, before falling back to name.

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
  with emp_completion as (
    select
      d.employee_id,
      max(coalesce(dsp.completed_at, d.updated_at)) as last_completed_at
    from public.duties d
    join public.duty_step_progress dsp
      on dsp.duty_id = d.id
      and dsp.is_completed = true
    where d.due_date between p_from and p_to
      and d.status = 'completed'
    group by d.employee_id
  )
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
  left join emp_completion ec
    on ec.employee_id = p.id
  where p.role = 'employee'
    and p.is_active = true
    and p.group_id = v_group_id
  group by p.id, p.full_name, ec.last_completed_at
  order by
    5 desc,                                -- 1. Completion rate desc
    6 desc,                                -- 2. Current streak desc
    4 desc,                                -- 3. Completed duties count desc
    ec.last_completed_at asc nulls last,   -- 4. Completion speed (who finished earlier)
    2 asc;                                 -- 5. Full name asc (deterministic fallback)
end;
$$;
