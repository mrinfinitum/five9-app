-- Unread comment badges: when each person last opened each request.
--
-- A comment is "new" for someone when another person posted it after they last
-- opened the request. Requests they've never opened count from
-- profiles.comments_seen_since, which starts now for everyone, so existing
-- conversations don't all light up at once when this ships.

alter table public.profiles
  add column if not exists comments_seen_since timestamptz not null default now();

create table if not exists public.request_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.request_reads enable row level security;

drop policy if exists "read own request reads" on public.request_reads;
create policy "read own request reads" on public.request_reads
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "record own request reads" on public.request_reads;
create policy "record own request reads" on public.request_reads
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_request(request_id));

drop policy if exists "update own request reads" on public.request_reads;
create policy "update own request reads" on public.request_reads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_view_request(request_id));
