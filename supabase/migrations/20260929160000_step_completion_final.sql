-- A completed checklist step is final for the employee: it can never be unticked.
--
-- The PWA no longer offers unticking, but installed PWAs update lazily, so an old version (or
-- an untick already sitting in a device's offline outbox) can still send is_completed = false.
-- Such an update is not rejected — a rejected write would sit in the outbox and retry forever
-- — it is kept as a no-op instead: the row stays completed with its original completed_at, the
-- update still matches one row (so flushOutboxWith() counts it as delivered), and the next
-- sync shows the step ticked again.
--
-- Supervisors, superadmins and server-side code (no auth.uid()) are not restricted.
-- Re-seeding a checklist (propagate_group_assignment_update) deletes and re-inserts rows, so
-- this update trigger never gets in its way.

create or replace function public.keep_step_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_completed
     and not new.is_completed
     and auth.uid() is not null
     and not (public.is_supervisor() or public.is_superadmin())
  then
    new.is_completed := true;
    new.completed_at := old.completed_at;
  end if;
  return new;
end;
$$;

-- BEFORE, so trg_sync_duty_status (AFTER) derives the duty status from the kept value.
create trigger trg_keep_step_completed
before update of is_completed on public.duty_step_progress
for each row execute function public.keep_step_completed();
