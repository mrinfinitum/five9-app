-- Five9 Media — project tracker schema.
-- Run once in the Supabase SQL editor (safe to re-run).

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, created automatically when a user is invited)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), nullif(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that existed before this migration.
insert into public.profiles (id, email, full_name)
select u.id, lower(u.email), nullif(u.raw_user_meta_data->>'full_name', '')
from auth.users u
where u.email is not null
on conflict (id) do nothing;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active and role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create sequence if not exists public.project_number_seq start 1001;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.project_number_seq'),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text,
  status text not null default 'inbox'
    check (status in ('inbox', 'in_progress', 'review', 'on_hold', 'completed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  project_type text,
  client text,
  start_date date,
  due_date date,
  sort_order double precision not null default 0,
  budget_cents bigint not null default 0 check (budget_cents >= 0),
  completed_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_status_order_idx on public.projects(status, sort_order);

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create or replace function public.set_project_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at = now();
  elsif new.status <> 'completed' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_projects_completed_at on public.projects;
create trigger set_projects_completed_at before insert or update of status on public.projects
  for each row execute function public.set_project_completed_at();

create table if not exists public.project_assignees (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_assignees_user_idx on public.project_assignees(user_id);

create table if not exists public.project_subtasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  status text not null default 'not_started'
    check (status in ('not_started', 'working_on_it', 'stuck', 'done')),
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_subtasks_project_idx on public.project_subtasks(project_id, sort_order);

drop trigger if exists set_project_subtasks_updated_at on public.project_subtasks;
create trigger set_project_subtasks_updated_at before update on public.project_subtasks
  for each row execute function public.set_updated_at();

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index if not exists project_comments_project_idx on public.project_comments(project_id, created_at);

create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  vendor text,
  status text not null default 'planned'
    check (status in ('planned', 'committed', 'paid', 'cancelled')),
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  expense_date date,
  created_at timestamptz not null default now()
);

create index if not exists project_expenses_project_idx on public.project_expenses(project_id, created_at);

-- ---------------------------------------------------------------------------
-- Row level security
-- Active members can see and work on every project. Only admins can delete
-- projects. Profile changes go through the server (service role) only.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignees enable row level security;
alter table public.project_subtasks enable row level security;
alter table public.project_comments enable row level security;
alter table public.project_expenses enable row level security;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using (public.is_active_member() or id = auth.uid());

drop policy if exists "members read projects" on public.projects;
create policy "members read projects" on public.projects
  for select to authenticated using (public.is_active_member());
drop policy if exists "members create projects" on public.projects;
create policy "members create projects" on public.projects
  for insert to authenticated with check (public.is_active_member());
drop policy if exists "members update projects" on public.projects;
create policy "members update projects" on public.projects
  for update to authenticated using (public.is_active_member()) with check (public.is_active_member());
drop policy if exists "admins delete projects" on public.projects;
create policy "admins delete projects" on public.projects
  for delete to authenticated using (public.is_admin());

drop policy if exists "members manage assignees" on public.project_assignees;
create policy "members manage assignees" on public.project_assignees
  for all to authenticated using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists "members manage subtasks" on public.project_subtasks;
create policy "members manage subtasks" on public.project_subtasks
  for all to authenticated using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists "members manage expenses" on public.project_expenses;
create policy "members manage expenses" on public.project_expenses
  for all to authenticated using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists "members read comments" on public.project_comments;
create policy "members read comments" on public.project_comments
  for select to authenticated using (public.is_active_member());
drop policy if exists "members add comments" on public.project_comments;
create policy "members add comments" on public.project_comments
  for insert to authenticated with check (public.is_active_member() and author_id = auth.uid());
drop policy if exists "authors or admins delete comments" on public.project_comments;
create policy "authors or admins delete comments" on public.project_comments
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());
