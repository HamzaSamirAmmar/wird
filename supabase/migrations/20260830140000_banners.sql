-- Supervisor-authored reminder cards (آية / حديث / حكمة / ملاحظة) shown as a horizontally
-- scrollable rail at the top of the employee app.
--
-- Deliberately global rather than per-group: these are short spiritual reminders for everyone,
-- not assignments. If per-group targeting is ever wanted, add a nullable group_id (null = all)
-- and widen the select policy — nothing here assumes global.

create type public.banner_kind as enum ('ayah', 'hadith', 'hikmah', 'note');

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  kind public.banner_kind not null default 'note',
  body text not null check (length(btrim(body)) between 1 and 1000),
  -- Attribution: "رواه البخاري", "البقرة: ٢٥٥", or null when there is nothing to cite.
  source text check (source is null or length(btrim(source)) <= 200),
  is_active boolean not null default true,
  -- Ascending; ties fall back to newest-first. Supervisors reorder by swapping neighbours.
  sort_order int not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Matches the employee query exactly: active rows in display order.
create index idx_banners_active_order on public.banners (is_active, sort_order, created_at desc);

create trigger trg_banners_updated_at
before update on public.banners
for each row execute function public.set_updated_at();

alter table public.banners enable row level security;

-- Employees read only what is published; supervisors see drafts too and manage everything.
create policy banners_select on public.banners
  for select using (is_active = true or public.is_supervisor());
create policy banners_insert on public.banners
  for insert with check (public.is_supervisor());
create policy banners_update on public.banners
  for update using (public.is_supervisor()) with check (public.is_supervisor());
create policy banners_delete on public.banners
  for delete using (public.is_supervisor());
