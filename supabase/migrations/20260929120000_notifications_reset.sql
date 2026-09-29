-- Fresh start for notifications: nothing sends on its own until the new design is defined.
--
-- Removed:
--   * every notification_campaigns row (the seeded daily 'ورد اليوم' and Friday reminder
--     included — seeds live in older migrations, so they are deleted here, not un-seeded);
--   * the 'wird-push-dispatch' cron job, so no campaign is dispatched on a schedule;
--   * the notify_new_duties trigger, so assigning a duty for today no longer pings.
--
-- Kept as plumbing for the redesign: the tables, dispatch_due_campaigns(),
-- notify_new_duties(), the edge functions, device tokens, telegram links, and the
-- 'wird-push-prune' housekeeping job (it only deletes stale device tokens, never sends).

delete from public.notification_campaigns;

select cron.unschedule(jobid)
from cron.job
where jobname = 'wird-push-dispatch';

drop trigger if exists trg_duties_notify_new on public.duties;
