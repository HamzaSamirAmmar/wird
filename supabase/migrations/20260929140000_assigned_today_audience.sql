-- 'assigned_today': everyone with a wird due today, finished or not. The 04:00 morning wird
-- uses it so a duty completed after midnight still gets its morning message; the 20:00
-- reminder stays on 'incomplete_today'.

alter table public.notification_campaigns
  drop constraint notification_campaigns_audience_check;

alter table public.notification_campaigns
  add constraint notification_campaigns_audience_check
  check (audience in ('all', 'group', 'user', 'assigned_today', 'incomplete_today'));

create or replace function public.campaign_profile_ids(p_campaign_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select * from public.notification_campaigns where id = p_campaign_id
  ),
  today as (
    select (now() at time zone 'Asia/Damascus')::date as d
  )
  select coalesce(array_agg(distinct p.id), '{}')
  from c
  cross join today
  join public.profiles p on p.is_active
  where (c.group_id is null or p.group_id = c.group_id)
    and case c.audience
      when 'all' then true
      when 'group' then true
      when 'user' then p.id = c.target_profile_id
      when 'assigned_today' then exists (
        select 1 from public.duties d
        where d.employee_id = p.id and d.due_date = today.d
      )
      when 'incomplete_today' then exists (
        select 1 from public.duties d
        where d.employee_id = p.id and d.due_date = today.d and d.status <> 'completed'
      )
      else false
    end;
$$;

update public.notification_campaigns
set audience = 'assigned_today'
where title = 'ورد اليوم' and schedule_kind = 'daily' and recur_time = '04:00';
