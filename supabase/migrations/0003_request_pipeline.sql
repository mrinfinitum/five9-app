-- Request Pipeline (parity with the Sales Hub marketing request pipeline).
-- Replaces the earlier, unused project tables with request tables:
-- requests, assignees, conversation (with internal notes and status history),
-- attachments, editable request types, and one-click satisfaction surveys.
-- Supports multiple boards. Admins see every board. Other users are given
-- access per board, as either "team" (works the board) or "requester"
-- (submits requests and follows their own).

-- ---------------------------------------------------------------------------
-- Remove the earlier project tracker tables (they were never used).
-- ---------------------------------------------------------------------------
drop table if exists public.project_expenses cascade;
drop table if exists public.project_comments cascade;
drop table if exists public.project_subtasks cascade;
drop table if exists public.project_assignees cascade;
drop table if exists public.projects cascade;
drop function if exists public.set_project_completed_at() cascade;
drop sequence if exists public.project_number_seq;

-- ---------------------------------------------------------------------------
-- Global roles are admin or member; board access is granted per board.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'member'));
alter table public.profiles add column if not exists phone text;

-- ---------------------------------------------------------------------------
-- Boards and board access
-- ---------------------------------------------------------------------------
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  description text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_boards_updated_at on public.boards;
create trigger set_boards_updated_at before update on public.boards
  for each row execute function public.set_updated_at();

create table if not exists public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access text not null default 'team' check (access in ('team', 'requester')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index if not exists board_members_user_idx on public.board_members(user_id);

insert into public.boards (name, slug, description)
values ('Five9 Media Requests', 'five9-media', 'Creative, campaign, video, and web requests for the Five9 Media team.')
on conflict (slug) do nothing;

-- 'team' or 'requester' for the signed-in user on a board (admins are team everywhere); null = no access.
create or replace function public.board_access(target_board uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then 'team'
    when not public.is_active_member() then null
    else (select access from public.board_members where board_id = target_board and user_id = auth.uid())
  end;
$$;

create or replace function public.can_work_board(target_board uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.board_access(target_board) = 'team', false);
$$;

create or replace function public.has_team_access()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.board_members
    where user_id = auth.uid() and access = 'team' and public.is_active_member()
  );
$$;

-- ---------------------------------------------------------------------------
-- Request types (categories) — the team can add new ones from the board.
-- ---------------------------------------------------------------------------
create table if not exists public.request_types (
  key text primary key,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.request_types (key, name, sort_order) values
  ('print-collateral', 'Print & Collateral', 10),
  ('digital-social', 'Social Media', 20),
  ('digital-marketing', 'Digital Marketing', 30),
  ('email-campaign', 'Email Campaign', 40),
  ('event-support', 'Event Support', 50),
  ('video-photo', 'Video & Photography', 60),
  ('web-landing', 'Web & Landing Pages', 70),
  ('brand-design', 'Brand & Design', 80),
  ('internal-marketing', 'Internal Marketing', 90),
  ('other', 'Something Else', 1000)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------
create sequence if not exists public.request_number_seq start 1001;

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  number integer not null unique default nextval('public.request_number_seq'),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text,
  status text not null default 'new'
    check (status in ('new', 'waiting', 'in_progress', 'creative_review', 'completed', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  request_type text references public.request_types(key) on update cascade on delete set null,
  due_date date,
  requester_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  sort_order double precision not null default 0,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists requests_board_status_idx on public.requests(board_id, status, sort_order);
create index if not exists requests_requester_idx on public.requests(requester_id);

drop trigger if exists set_requests_updated_at on public.requests;
create trigger set_requests_updated_at before update on public.requests
  for each row execute function public.set_updated_at();

create or replace function public.set_request_completed_at()
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

drop trigger if exists set_requests_completed_at on public.requests;
create trigger set_requests_completed_at before insert or update of status on public.requests
  for each row execute function public.set_request_completed_at();

create or replace function public.request_status_name(status_key text)
returns text language sql immutable as $$
  select case status_key
    when 'new' then 'Inbox'
    when 'waiting' then 'On Hold'
    when 'in_progress' then 'In Progress'
    when 'creative_review' then 'Creative Review'
    when 'completed' then 'Completed'
    when 'cancelled' then 'Cancelled'
    else status_key
  end;
$$;

-- The board team sees every request on it; a requester sees the ones they asked for.
create or replace function public.can_view_request(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests r
    where r.id = target
      and (public.can_work_board(r.board_id)
           or (r.requester_id = auth.uid() and public.board_access(r.board_id) is not null))
  );
$$;

create or replace function public.can_work_request(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.requests r where r.id = target and public.can_work_board(r.board_id));
$$;

create table if not exists public.request_assignees (
  request_id uuid not null references public.requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create index if not exists request_assignees_user_idx on public.request_assignees(user_id);

create table if not exists public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  is_internal boolean not null default false,
  kind text not null default 'comment' check (kind in ('comment', 'status_change')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists request_comments_request_idx on public.request_comments(request_id, created_at);

-- Every status change is written to the conversation (used for history and analytics).
create or replace function public.log_request_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.request_comments (request_id, author_id, body, kind, metadata)
    values (
      new.id,
      auth.uid(),
      format('Moved this request from %s to %s.', public.request_status_name(old.status), public.request_status_name(new.status)),
      'status_change',
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists log_request_status_change on public.requests;
create trigger log_request_status_change after update of status on public.requests
  for each row execute function public.log_request_status_change();

create table if not exists public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  file_size bigint,
  content_type text,
  storage_path text not null unique,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists request_attachments_request_idx on public.request_attachments(request_id, created_at);

-- One-click satisfaction surveys, emailed when a request is completed.
-- Only the server (service role) reads or writes these.
create table if not exists public.request_surveys (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  closer_id uuid references public.profiles(id) on delete set null,
  token_hash text not null unique,
  rating smallint check (rating between 1 and 5),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  invalidated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists request_surveys_request_idx on public.request_surveys(request_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.request_types enable row level security;
alter table public.requests enable row level security;
alter table public.request_assignees enable row level security;
alter table public.request_comments enable row level security;
alter table public.request_attachments enable row level security;
alter table public.request_surveys enable row level security;

drop policy if exists "see accessible boards" on public.boards;
create policy "see accessible boards" on public.boards
  for select to authenticated using (public.board_access(id) is not null);
drop policy if exists "admins manage boards" on public.boards;
create policy "admins manage boards" on public.boards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "see board members" on public.board_members;
create policy "see board members" on public.board_members
  for select to authenticated
  using (public.is_admin() or user_id = auth.uid() or public.can_work_board(board_id));
drop policy if exists "admins manage board members" on public.board_members;
create policy "admins manage board members" on public.board_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "members read request types" on public.request_types;
create policy "members read request types" on public.request_types
  for select to authenticated using (public.is_active_member());
drop policy if exists "team adds request types" on public.request_types;
create policy "team adds request types" on public.request_types
  for insert to authenticated with check (public.has_team_access());
drop policy if exists "team updates request types" on public.request_types;
create policy "team updates request types" on public.request_types
  for update to authenticated using (public.has_team_access()) with check (public.has_team_access());

drop policy if exists "view board or own requests" on public.requests;
create policy "view board or own requests" on public.requests
  for select to authenticated
  using (public.can_work_board(board_id) or (requester_id = auth.uid() and public.board_access(board_id) is not null));
drop policy if exists "submit requests" on public.requests;
create policy "submit requests" on public.requests
  for insert to authenticated
  with check (
    public.can_work_board(board_id)
    or (public.board_access(board_id) = 'requester' and requester_id = auth.uid() and status = 'new')
  );
drop policy if exists "team updates requests" on public.requests;
create policy "team updates requests" on public.requests
  for update to authenticated using (public.can_work_board(board_id)) with check (public.can_work_board(board_id));
drop policy if exists "team deletes requests" on public.requests;
create policy "team deletes requests" on public.requests
  for delete to authenticated using (public.can_work_board(board_id));

drop policy if exists "team manages assignees" on public.request_assignees;
create policy "team manages assignees" on public.request_assignees
  for all to authenticated using (public.can_work_request(request_id)) with check (public.can_work_request(request_id));

drop policy if exists "read visible comments" on public.request_comments;
create policy "read visible comments" on public.request_comments
  for select to authenticated
  using (public.can_work_request(request_id) or (not is_internal and public.can_view_request(request_id)));
drop policy if exists "post comments" on public.request_comments;
create policy "post comments" on public.request_comments
  for insert to authenticated
  with check (
    author_id = auth.uid() and kind = 'comment'
    and (public.can_work_request(request_id) or (not is_internal and public.can_view_request(request_id)))
  );
drop policy if exists "team deletes comments" on public.request_comments;
create policy "team deletes comments" on public.request_comments
  for delete to authenticated using (public.can_work_request(request_id));

drop policy if exists "read visible attachments" on public.request_attachments;
create policy "read visible attachments" on public.request_attachments
  for select to authenticated using (public.can_view_request(request_id));
drop policy if exists "add attachments" on public.request_attachments;
create policy "add attachments" on public.request_attachments
  for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_view_request(request_id));
drop policy if exists "team deletes attachments" on public.request_attachments;
create policy "team deletes attachments" on public.request_attachments
  for delete to authenticated using (public.can_work_request(request_id));
