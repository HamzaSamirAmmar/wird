-- Recurrence wall-clock moves from Asia/Riyadh to Asia/Damascus.
--
-- Both are fixed UTC+3 with no DST (Syria abolished DST in October 2022), so this is a pure
-- relabelling: every already-computed next_run_at stays correct and no backfill is needed.
-- Kept as a distinct zone rather than a hardcoded +03 so that if Syria ever reintroduces DST,
-- tzdata fixes this for us instead of the arithmetic silently drifting by an hour.

create or replace function public.next_campaign_run(
  p_kind text,
  p_scheduled_at timestamptz,
  p_weekday smallint,
  p_time time,
  p_after timestamptz default now()
)
returns timestamptz
language sql
stable
as $$
  select case
    when p_kind = 'now' then p_after
    when p_kind = 'once' then p_scheduled_at
    when p_kind = 'weekly' then (
      with local_now as (
        select (p_after at time zone 'Asia/Damascus')::timestamp as ts
      ),
      candidate as (
        select
          ((local_now.ts)::date
            + (((p_weekday - extract(dow from local_now.ts)::int) % 7) + 7) % 7
            + p_time) as local_dt
        from local_now
      )
      select case
        when (candidate.local_dt at time zone 'Asia/Damascus') <= p_after
          then ((candidate.local_dt + interval '7 days') at time zone 'Asia/Damascus')
        else (candidate.local_dt at time zone 'Asia/Damascus')
      end
      from candidate
    )
    else null
  end;
$$;

-- Recompute pending weekly occurrences so any already-scheduled row is expressed in the new
-- zone. A no-op while both zones share +03, but it keeps this migration correct on its own
-- terms rather than relying on that coincidence.
update public.notification_campaigns
  set next_run_at = public.next_campaign_run(
    schedule_kind, scheduled_at, recur_weekday, recur_time
  )
  where is_active and schedule_kind = 'weekly';
