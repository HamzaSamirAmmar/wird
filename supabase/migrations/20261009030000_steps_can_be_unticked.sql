-- Ticks are no longer final: an employee may untick a step.
--
-- keep_step_completed (20261007000000) turned every employee untick into a no-op. It goes.
--
-- What keeps the leaderboard honest is completed_at, now owned by the server on every
-- transition (stamp_step_completed_at):
--   * untick            → completed_at is cleared;
--   * tick (from unticked, or a new row) → the time the device reports, but never later than
--     now (offline ticks that sync hours later keep their real time; a clock running ahead
--     cannot claim a future one), or now when none is sent;
--   * a completed step saved again (still ticked) keeps its original time — a client can't
--     rewrite when a step was done.
-- So unticking and re-ticking makes the step (and the day) count as finished at the re-tick
-- — later — which is the intended cost of unticking. The app does not mention it.

drop trigger if exists trg_keep_step_completed on public.duty_step_progress;
drop function if exists public.keep_step_completed();

create or replace function public.stamp_step_completed_at()
returns trigger
language plpgsql
as $$
begin
  if not new.is_completed then
    new.completed_at := null;
  elsif tg_op = 'UPDATE' and old.is_completed then
    new.completed_at := coalesce(old.completed_at, least(coalesce(new.completed_at, now()), now()));
  else
    new.completed_at := least(coalesce(new.completed_at, now()), now());
  end if;
  return new;
end;
$$;
