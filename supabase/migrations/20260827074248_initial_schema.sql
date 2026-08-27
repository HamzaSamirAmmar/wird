-- ورد (Wird) — initial schema
-- Groups, profiles, duty assignment (direct + group fan-out), and per-step checklist tracking.

create extension if not exists "pgcrypto";

-- ─── Enums ──────────────────────────────────────────────────────────────────

create type public.user_role as enum ('employee', 'supervisor');
create type public.duty_category as enum ('new_memorization', 'minor_review', 'major_review');
create type public.duty_status as enum ('pending', 'in_progress', 'completed');

-- ─── Tables ─────────────────────────────────────────────────────────────────

-- created_by has no inline FK: profiles (which it references) is created below, and
-- profiles.group_id references groups, so the groups -> profiles FK is added afterward.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text not null,
  role public.user_role not null,
  group_id uuid references public.groups (id),
  must_change_password boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint employee_requires_group check (role = 'supervisor' or group_id is not null)
);

alter table public.groups
  add constraint groups_created_by_fkey foreign key (created_by) references public.profiles (id);

create table public.duty_category_steps (
  category public.duty_category not null,
  step_order smallint not null,
  step_key text not null,
  step_label text not null,
  primary key (category, step_order)
);

create table public.duty_group_assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  category public.duty_category not null,
  due_date date not null,
  scope_surah_from smallint not null check (scope_surah_from between 1 and 114),
  scope_ayah_from smallint not null check (scope_ayah_from > 0),
  scope_surah_to smallint not null check (scope_surah_to between 1 and 114),
  scope_ayah_to smallint not null check (scope_ayah_to > 0),
  scope_note text,
  assigned_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_scope_order check (
    scope_surah_from < scope_surah_to
    or (scope_surah_from = scope_surah_to and scope_ayah_from <= scope_ayah_to)
  )
);

create table public.duties (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id),
  assigned_by uuid not null references public.profiles (id),
  group_assignment_id uuid references public.duty_group_assignments (id) on delete set null,
  category public.duty_category not null,
  due_date date not null,
  scope_surah_from smallint not null check (scope_surah_from between 1 and 114),
  scope_ayah_from smallint not null check (scope_ayah_from > 0),
  scope_surah_to smallint not null check (scope_surah_to between 1 and 114),
  scope_ayah_to smallint not null check (scope_ayah_to > 0),
  scope_note text,
  status public.duty_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_scope_order check (
    scope_surah_from < scope_surah_to
    or (scope_surah_from = scope_surah_to and scope_ayah_from <= scope_ayah_to)
  )
);

create table public.duty_step_progress (
  id uuid primary key default gen_random_uuid(),
  duty_id uuid not null references public.duties (id) on delete cascade,
  step_order smallint not null,
  step_key text not null,
  is_completed boolean not null default false,
  completed_at timestamptz,
  unique (duty_id, step_order)
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

create index idx_profiles_group_id on public.profiles (group_id);
create index idx_duties_employee_due_date on public.duties (employee_id, due_date);
create index idx_duties_group_assignment_id on public.duties (group_assignment_id);
create index idx_duty_group_assignments_group_due_date on public.duty_group_assignments (group_id, due_date);
create index idx_duty_step_progress_duty_id on public.duty_step_progress (duty_id);

-- ─── updated_at helper ──────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_duties_updated_at
before update on public.duties
for each row execute function public.set_updated_at();

create trigger trg_duty_group_assignments_updated_at
before update on public.duty_group_assignments
for each row execute function public.set_updated_at();

-- ─── Business logic triggers ────────────────────────────────────────────────

-- Seed a new duty's checklist rows from the static step definitions for its category.
create or replace function public.seed_duty_steps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.duty_step_progress (duty_id, step_order, step_key)
  select new.id, s.step_order, s.step_key
  from public.duty_category_steps s
  where s.category = new.category;
  return new;
end;
$$;

create trigger trg_seed_duty_steps
after insert on public.duties
for each row execute function public.seed_duty_steps();

-- Fan a group assignment out into one duty per active employee in that group.
create or replace function public.fanout_group_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.duties (
    employee_id, assigned_by, group_assignment_id, category, due_date,
    scope_surah_from, scope_ayah_from, scope_surah_to, scope_ayah_to, scope_note
  )
  select p.id, new.assigned_by, new.id, new.category, new.due_date,
         new.scope_surah_from, new.scope_ayah_from, new.scope_surah_to, new.scope_ayah_to, new.scope_note
  from public.profiles p
  where p.group_id = new.group_id
    and p.role = 'employee'
    and p.is_active = true;
  return new;
end;
$$;

create trigger trg_fanout_group_assignment
after insert on public.duty_group_assignments
for each row execute function public.fanout_group_assignment();

-- Editing a group assignment propagates to its still-pending fanned-out duties only,
-- and reseeds their checklist if the category changed.
create or replace function public.propagate_group_assignment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duty_ids uuid[];
begin
  update public.duties
  set category = new.category,
      due_date = new.due_date,
      scope_surah_from = new.scope_surah_from,
      scope_ayah_from = new.scope_ayah_from,
      scope_surah_to = new.scope_surah_to,
      scope_ayah_to = new.scope_ayah_to,
      scope_note = new.scope_note
  where group_assignment_id = new.id
    and status = 'pending';

  select array_agg(id) into v_duty_ids
  from public.duties
  where group_assignment_id = new.id
    and status = 'pending';

  if v_duty_ids is not null then
    delete from public.duty_step_progress where duty_id = any (v_duty_ids);

    insert into public.duty_step_progress (duty_id, step_order, step_key)
    select d.id, s.step_order, s.step_key
    from unnest(v_duty_ids) as d (id)
    join public.duty_category_steps s on s.category = new.category;
  end if;

  return new;
end;
$$;

create trigger trg_propagate_group_assignment_update
after update on public.duty_group_assignments
for each row execute function public.propagate_group_assignment_update();

-- A duty's status is derived from its checklist, never set directly by an employee.
create or replace function public.sync_duty_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duty_id uuid;
  v_total int;
  v_completed int;
begin
  v_duty_id := coalesce(new.duty_id, old.duty_id);

  select count(*), count(*) filter (where is_completed)
  into v_total, v_completed
  from public.duty_step_progress
  where duty_id = v_duty_id;

  update public.duties
  set status = (case
      when v_completed = 0 then 'pending'
      when v_completed = v_total then 'completed'
      else 'in_progress'
    end)::public.duty_status
  where id = v_duty_id;

  return null;
end;
$$;

create trigger trg_sync_duty_status
after insert or update or delete on public.duty_step_progress
for each row execute function public.sync_duty_status();

-- ─── RLS ────────────────────────────────────────────────────────────────────

create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'supervisor'
  );
$$;

alter table public.groups enable row level security;
alter table public.profiles enable row level security;
alter table public.duty_category_steps enable row level security;
alter table public.duty_group_assignments enable row level security;
alter table public.duties enable row level security;
alter table public.duty_step_progress enable row level security;

-- groups: employees see only their own group; supervisors see/manage all.
create policy groups_select on public.groups
  for select using (id = (select group_id from public.profiles where id = auth.uid()) or public.is_supervisor());
create policy groups_insert on public.groups
  for insert with check (public.is_supervisor());
create policy groups_update on public.groups
  for update using (public.is_supervisor());
create policy groups_delete on public.groups
  for delete using (public.is_supervisor());

-- profiles: self or supervisor to read; self can update own row (e.g. must_change_password),
-- supervisor can update/insert/delete any row.
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_supervisor());
create policy profiles_insert on public.profiles
  for insert with check (public.is_supervisor());
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_supervisor());
create policy profiles_delete on public.profiles
  for delete using (public.is_supervisor());

-- duty_category_steps: static reference data, readable by any authenticated user.
create policy duty_category_steps_select on public.duty_category_steps
  for select using (auth.role() = 'authenticated');

-- duty_group_assignments: supervisor-only surface.
create policy duty_group_assignments_all on public.duty_group_assignments
  for all using (public.is_supervisor()) with check (public.is_supervisor());

-- duties: employees read their own (status is system-derived, no direct employee update);
-- supervisors have full control.
create policy duties_select on public.duties
  for select using (employee_id = auth.uid() or public.is_supervisor());
create policy duties_insert on public.duties
  for insert with check (public.is_supervisor());
create policy duties_update on public.duties
  for update using (public.is_supervisor());
create policy duties_delete on public.duties
  for delete using (public.is_supervisor());

-- duty_step_progress: employees can toggle their own duty's steps; supervisors see all.
create policy duty_step_progress_select on public.duty_step_progress
  for select using (
    duty_id in (select id from public.duties where employee_id = auth.uid())
    or public.is_supervisor()
  );
create policy duty_step_progress_update on public.duty_step_progress
  for update using (
    duty_id in (select id from public.duties where employee_id = auth.uid())
    or public.is_supervisor()
  );

-- ─── Seed: fixed duty category steps (from the workplace's actual daily-duty spec) ─────────

insert into public.duty_category_steps (category, step_order, step_key, step_label) values
  ('new_memorization', 1, 'listen', 'سماع الحفظ الجديد من قارئ عدة مرات كل على حسبه'),
  ('new_memorization', 2, 'read_seeing_7', 'قراءة الحفظ الجديد سبع مرات عن حاضر مع تمعن النظر'),
  ('new_memorization', 3, 'read_by_heart_watch_7', 'قراءة الحفظ الجديد سبع مرات غيباً قدر الإمكان، وعند التوقف مشاهدة مكان الخطأ ثم إتمام القراءة غيباً'),
  ('new_memorization', 4, 'read_by_heart_7', 'قراءة الحفظ الجديد سبع مرات غيباً'),
  ('minor_review', 1, 'read_once', 'قراءة ما تم تحديده كمراجعة صغرى مرة واحدة غيباً'),
  ('major_review', 1, 'read_once', 'قراءة ما تم تحديده كمراجعة كبرى مرة واحدة غيباً');
