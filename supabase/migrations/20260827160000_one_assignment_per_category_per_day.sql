-- One assignment per (group, category, day).
--
-- The dashboard now edits a group's whole day at once — tick the categories that apply, each
-- with its own range — so a day must have at most one row per category or "the مراجعة صغرى for
-- this day" stops being a well-defined thing to load, update, or untick. Nothing enforced that
-- before, and a double-submit silently issued every employee the same duty twice.

-- Collapse any pre-existing duplicates onto the earliest row, moving its duties across so no
-- employee loses checklist progress, before the constraint goes on.
with ranked as (
  select id,
         first_value(id) over (partition by group_id, category, due_date order by created_at, id) as keep_id
  from public.duty_group_assignments
)
update public.duties d
set group_assignment_id = r.keep_id
from ranked r
where d.group_assignment_id = r.id
  and r.id <> r.keep_id;

with ranked as (
  select id,
         first_value(id) over (partition by group_id, category, due_date order by created_at, id) as keep_id
  from public.duty_group_assignments
)
delete from public.duty_group_assignments a
using ranked r
where a.id = r.id
  and r.id <> r.keep_id;

alter table public.duty_group_assignments
  drop constraint if exists duty_group_assignments_group_category_date_key;

alter table public.duty_group_assignments
  add constraint duty_group_assignments_group_category_date_key
  unique (group_id, category, due_date);

-- Removing a category from a day should take its duties with it. The FK was ON DELETE SET NULL,
-- which orphaned them: the assignment vanished from the dashboard while every employee kept
-- seeing the duty, with nothing left to link it back to.
alter table public.duties
  drop constraint if exists duties_group_assignment_id_fkey;

alter table public.duties
  add constraint duties_group_assignment_id_fkey
  foreign key (group_assignment_id) references public.duty_group_assignments (id) on delete cascade;
