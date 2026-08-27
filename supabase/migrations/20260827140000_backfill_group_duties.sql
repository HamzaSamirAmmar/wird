-- Fan a group's upcoming assignments out to an employee who joins that group.
--
-- trg_fanout_group_assignment only fires when an assignment is created, so it covers
-- "assign a duty to a group that already has members". The reverse order — create the
-- assignment first, then add the employee to the group — left that employee with no duty
-- rows at all, permanently, with nothing in the UI to explain the absence.
--
-- Scope: today and future only. Joining a group grants its upcoming duties; it does not
-- retroactively manufacture duties for days that have already passed. Moving an employee
-- out of a group deliberately leaves their existing duties in place, since those rows carry
-- completed checklist progress that should not vanish.

create or replace function public.backfill_group_duties()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> 'employee' or new.group_id is null or new.is_active = false then
    return new;
  end if;

  insert into public.duties (
    employee_id, assigned_by, group_assignment_id, category, due_date,
    scope_surah_from, scope_ayah_from, scope_surah_to, scope_ayah_to, scope_note
  )
  select new.id, a.assigned_by, a.id, a.category, a.due_date,
         a.scope_surah_from, a.scope_ayah_from, a.scope_surah_to, a.scope_ayah_to, a.scope_note
  from public.duty_group_assignments a
  where a.group_id = new.group_id
    and a.due_date >= current_date
    -- Idempotent: never issue a second duty for an assignment this employee already holds,
    -- so re-activating or re-saving a profile is safe.
    and not exists (
      select 1
      from public.duties d
      where d.group_assignment_id = a.id
        and d.employee_id = new.id
    );

  return new;
end;
$$;

-- `of group_id, is_active, role` keeps unrelated writes (e.g. clearing
-- must_change_password on first login) from re-running the scan.
create trigger trg_backfill_group_duties
after insert or update of group_id, is_active, role on public.profiles
for each row execute function public.backfill_group_duties();
