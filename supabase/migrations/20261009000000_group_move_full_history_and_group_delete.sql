-- ─── 1. A group move carries the new group's whole history ──────────────────────────────────
--
-- Moving an employee still deletes all of their duties (old group's history included — their
-- checklists cascade). The new group's duties are now issued for EVERY assigned date, past
-- ones included, so the employee has the same days as the group's existing members. Past days
-- start `pending`, i.e. unfinished, exactly like for a member who never ticked them.

create or replace function public.backfill_group_duties()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    delete from public.duties where employee_id = new.id;
  end if;

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

-- ─── 2. Deleting a group takes its day plans with it ────────────────────────────────────────
--
-- Members (profiles.group_id / admin_group_id) still block the delete — people are never
-- removed implicitly; move them first. The group's assignments (and, through their existing
-- cascade, the duties) go with it.

alter table public.duty_group_assignments
  drop constraint duty_group_assignments_group_id_fkey,
  add constraint duty_group_assignments_group_id_fkey
    foreign key (group_id) references public.groups (id) on delete cascade;
