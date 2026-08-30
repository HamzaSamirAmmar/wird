-- Fix: 'now' campaigns must be immediately due.
--
-- next_campaign_run() returned null for schedule_kind='now', but the dispatcher and the
-- edge function's atomic claim both filter on `next_run_at <= now()` — NULL never
-- matches, so an immediate send was silently never dispatchable. Return the current
-- instant instead; the claim nulls it again after sending, so it still fires exactly once.

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
        select (p_after at time zone 'Asia/Riyadh')::timestamp as ts
      ),
      candidate as (
        select
          ((local_now.ts)::date
            + (((p_weekday - extract(dow from local_now.ts)::int) % 7) + 7) % 7
            + p_time) as local_dt
        from local_now
      )
      select case
        when (candidate.local_dt at time zone 'Asia/Riyadh') <= p_after
          then ((candidate.local_dt + interval '7 days') at time zone 'Asia/Riyadh')
        else (candidate.local_dt at time zone 'Asia/Riyadh')
      end
      from candidate
    )
    else null
  end;
$$;

-- Backfill: any 'now' campaign already inserted (e.g. from the dashboard) with a dead
-- next_run_at becomes due immediately.
update public.notification_campaigns
  set next_run_at = now()
  where schedule_kind = 'now' and is_active and last_sent_at is null;
