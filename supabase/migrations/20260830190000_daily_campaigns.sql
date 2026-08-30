-- Adds a 'daily' recurrence to notification campaigns.
--
-- The dashboard now groups campaigns by *shape* rather than by raw kind: instant ('now'),
-- one-off ('once', ends after its single send), and recurring ('daily'/'weekly', a standing
-- rule). 'daily' is the second recurring kind — it carries a time and no weekday.

-- ─── Constraints ──────────────────────────────────────────────────────────────

-- `if exists` because the inline column check's auto-generated name is a Postgres
-- implementation detail, not something this migration should hard-depend on.
alter table public.notification_campaigns
  drop constraint if exists notification_campaigns_schedule_kind_check;

alter table public.notification_campaigns
  add constraint notification_campaigns_schedule_kind_check
  check (schedule_kind in ('now', 'once', 'daily', 'weekly'));

-- A daily rule needs a time but no weekday; the weekly rule keeps needing both.
alter table public.notification_campaigns
  add constraint campaign_daily_requires_time
  check (schedule_kind <> 'daily' or recur_time is not null);

-- ─── Schedule maths ───────────────────────────────────────────────────────────
-- Wall-clock in Asia/Damascus (fixed +03, no DST since 2022), so plain date arithmetic
-- is exact. Same shape as the weekly branch, with a one-day step instead of seven.

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
    when p_kind = 'daily' then (
      with local_now as (
        select (p_after at time zone 'Asia/Damascus')::timestamp as ts
      ),
      candidate as (
        select ((local_now.ts)::date + p_time) as local_dt
        from local_now
      )
      select case
        when (candidate.local_dt at time zone 'Asia/Damascus') <= p_after
          then ((candidate.local_dt + interval '1 day') at time zone 'Asia/Damascus')
        else (candidate.local_dt at time zone 'Asia/Damascus')
      end
      from candidate
    )
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
