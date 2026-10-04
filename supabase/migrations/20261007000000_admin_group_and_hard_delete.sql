-- Two changes:
--   1. A person can be an admin of a group independently of being an employee.
--      `profiles.admin_group_id` is the group they manage (null = not an admin).
--        - admin only:         role 'supervisor' (admin_group_id = group_id, as before; no duties)
--        - admin + employee:   role 'employee' with admin_group_id set (may be a different
--                              group from group_id: they do duties in one, manage another)
--        - employee only:      role 'employee', admin_group_id null
--        - superadmin:         role 'superadmin', admin_group_id null (global)
--      Only a superadmin can grant or change this.
--   2. Users can be hard-deleted: their duties go with them, and authored plans / campaigns
--      survive with a null author.

-- ─── 1. admin_group_id ─────────────────────────────────────────────────────────────────────

alter table public.profiles add column admin_group_id uuid references public.groups (id);

update public.profiles set admin_group_id = group_id where role = 'supervisor';

alter table public.profiles
  add constraint admin_group_matches_role check (
    (role <> 'supervisor' or admin_group_id is not null)
    and (role <> 'superadmin' or admin_group_id is null)
  );

create index idx_profiles_admin_group_id on public.profiles (admin_group_id);

-- "Supervisor" now means: manages a group (whatever the role). Superadmin has no admin group,
-- so it stays false for them, exactly as before.
create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and admin_group_id is not null
  );
$$;

-- Every use of caller_group_id() is an admin-scope check (policies and supervisor RPCs gated
-- by is_supervisor()), so it now resolves to the group the caller manages, falling back to
-- their own group for non-admins (where it is never consulted).
create or replace function public.caller_group_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(admin_group_id, group_id) from public.profiles where id = auth.uid();
$$;

-- An admin must be able to see the group they manage even when it is not their own.
drop policy groups_select on public.groups;
create policy groups_select on public.groups
  for select using (
    id = (select group_id from public.profiles where id = auth.uid())
    or public.is_superadmin()
    or id = public.caller_group_id()
  );

-- Group admins manage plain employees only — never another admin's row (or their own admin
-- rights). `admin_group_id is null` keeps them out of admin rows entirely.
drop policy profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (
    public.is_superadmin()
    or (
      public.is_supervisor() and role = 'employee' and admin_group_id is null
      and group_id = public.caller_group_id()
    )
  );

drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (
    id = auth.uid()
    or public.is_superadmin()
    or (
      public.is_supervisor() and role = 'employee' and admin_group_id is null
      and group_id = public.caller_group_id()
    )
  )
  with check (
    id = auth.uid()
    or public.is_superadmin()
    or (
      public.is_supervisor() and role = 'employee' and admin_group_id is null
      and group_id = public.caller_group_id()
    )
  );

drop policy profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete using (
    public.is_superadmin()
    or (
      public.is_supervisor() and role = 'employee' and admin_group_id is null
      and id <> auth.uid() and group_id = public.caller_group_id()
    )
  );

-- Nobody but a superadmin (or server code, which has no auth.uid()) may change a role or an
-- admin grant — the own-row update policy would otherwise let anyone promote themselves.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_superadmin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.admin_group_id is distinct from old.admin_group_id then
    raise exception 'not authorized';
  end if;
  return new;
end;
$$;

create trigger trg_guard_profile_privileges
before update on public.profiles
for each row execute function public.guard_profile_privileges();

-- An admin who is also an employee is still an employee on their own checklist: ticks stay
-- final there. Only other people's duties (and superadmin / server code) are unrestricted.
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
     and not public.is_superadmin()
     and (
       not public.is_supervisor()
       or exists (
         select 1 from public.duties d
         where d.id = new.duty_id and d.employee_id = auth.uid()
       )
     )
  then
    new.is_completed := true;
    new.completed_at := old.completed_at;
  end if;
  return new;
end;
$$;

-- ─── 2. Hard delete ────────────────────────────────────────────────────────────────────────

-- The person's own duties (and, through the existing cascade, their checklists) go with them.
alter table public.duties drop constraint duties_employee_id_fkey;
alter table public.duties
  add constraint duties_employee_id_fkey
  foreign key (employee_id) references public.profiles (id) on delete cascade;

-- Authorship is history, not ownership: deleting an admin keeps the plans they wrote.
alter table public.duties alter column assigned_by drop not null;
alter table public.duties drop constraint duties_assigned_by_fkey;
alter table public.duties
  add constraint duties_assigned_by_fkey
  foreign key (assigned_by) references public.profiles (id) on delete set null;

alter table public.duty_group_assignments alter column assigned_by drop not null;
alter table public.duty_group_assignments drop constraint duty_group_assignments_assigned_by_fkey;
alter table public.duty_group_assignments
  add constraint duty_group_assignments_assigned_by_fkey
  foreign key (assigned_by) references public.profiles (id) on delete set null;

alter table public.groups drop constraint groups_created_by_fkey;
alter table public.groups
  add constraint groups_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.banners drop constraint banners_created_by_fkey;
alter table public.banners
  add constraint banners_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.notification_campaigns drop constraint notification_campaigns_created_by_fkey;
alter table public.notification_campaigns
  add constraint notification_campaigns_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- A campaign aimed at one person has no meaning without them (and the audience check forbids
-- a null target), so it goes too.
alter table public.notification_campaigns drop constraint notification_campaigns_target_profile_id_fkey;
alter table public.notification_campaigns
  add constraint notification_campaigns_target_profile_id_fkey
  foreign key (target_profile_id) references public.profiles (id) on delete cascade;
