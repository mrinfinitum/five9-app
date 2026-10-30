-- Faster row-level security.
--
-- The original read policies called per-row functions (can_work_board,
-- can_work_request, board_access), so loading a board ran several lookups for
-- every request and every comment. These versions work out the signed-in
-- user's boards and requests once per query and filter with IN (...), which
-- Postgres evaluates a single time.
--
-- Safety: before and after the change, this migration records exactly which
-- rows every existing user can see in each table, and aborts (rolling back the
-- whole migration) if anything differs.

-- ---------------------------------------------------------------------------
-- Snapshot helper: per user, a fingerprint of the rows visible in each table.
-- ---------------------------------------------------------------------------
create temp table rls_check (phase text, user_id uuid, table_name text, digest text) on commit drop;

create or replace function pg_temp.rls_snapshot(phase text)
returns void language plpgsql as $$
declare
  u uuid;
  t text;
  d text;
begin
  for u in select id from public.profiles loop
    foreach t in array array['boards', 'board_members', 'profiles', 'request_types', 'requests',
                             'request_assignees', 'request_comments', 'request_attachments'] loop
      perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      execute format(
        'select md5(coalesce(string_agg(x::text, %L order by x::text), %L)) from public.%I x',
        '|', '', t
      ) into d;
      execute 'reset role';
      insert into rls_check values (phase, u, t, d);
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select pg_temp.rls_snapshot('before');

-- ---------------------------------------------------------------------------
-- Set-returning helpers (evaluated once per query)
-- ---------------------------------------------------------------------------
create or replace function public.my_team_board_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select b.id from public.boards b where public.is_admin()
  union
  select bm.board_id from public.board_members bm
  where bm.user_id = auth.uid() and bm.access = 'team' and public.is_active_member();
$$;

create or replace function public.my_board_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select b.id from public.boards b where public.is_admin()
  union
  select bm.board_id from public.board_members bm
  where bm.user_id = auth.uid() and public.is_active_member();
$$;

create or replace function public.my_workable_request_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select r.id from public.requests r where r.board_id in (select public.my_team_board_ids());
$$;

create or replace function public.my_visible_request_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select r.id from public.requests r
  where r.board_id in (select public.my_team_board_ids())
     or (r.requester_id = auth.uid() and r.board_id in (select public.my_board_ids()));
$$;

-- ---------------------------------------------------------------------------
-- Read policies
-- ---------------------------------------------------------------------------
drop policy if exists "see accessible boards" on public.boards;
create policy "see accessible boards" on public.boards
  for select to authenticated using (id in (select public.my_board_ids()));

drop policy if exists "see board members" on public.board_members;
create policy "see board members" on public.board_members
  for select to authenticated
  using (
    (select public.is_admin())
    or user_id = (select auth.uid())
    or board_id in (select public.my_team_board_ids())
  );

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using ((select public.is_active_member()) or id = (select auth.uid()));

drop policy if exists "members read request types" on public.request_types;
create policy "members read request types" on public.request_types
  for select to authenticated using ((select public.is_active_member()));

drop policy if exists "view board or own requests" on public.requests;
create policy "view board or own requests" on public.requests
  for select to authenticated
  using (
    board_id in (select public.my_team_board_ids())
    or (requester_id = (select auth.uid()) and board_id in (select public.my_board_ids()))
  );

-- Assignees: separate read policy (fast) from write policies (single-row checks).
drop policy if exists "team manages assignees" on public.request_assignees;
drop policy if exists "read assignees" on public.request_assignees;
create policy "read assignees" on public.request_assignees
  for select to authenticated using (request_id in (select public.my_workable_request_ids()));
drop policy if exists "team adds assignees" on public.request_assignees;
create policy "team adds assignees" on public.request_assignees
  for insert to authenticated with check (public.can_work_request(request_id));
drop policy if exists "team updates assignees" on public.request_assignees;
create policy "team updates assignees" on public.request_assignees
  for update to authenticated using (public.can_work_request(request_id)) with check (public.can_work_request(request_id));
drop policy if exists "team removes assignees" on public.request_assignees;
create policy "team removes assignees" on public.request_assignees
  for delete to authenticated using (public.can_work_request(request_id));

drop policy if exists "read visible comments" on public.request_comments;
create policy "read visible comments" on public.request_comments
  for select to authenticated
  using (
    request_id in (select public.my_workable_request_ids())
    or (not is_internal and request_id in (select public.my_visible_request_ids()))
  );

drop policy if exists "read visible attachments" on public.request_attachments;
create policy "read visible attachments" on public.request_attachments
  for select to authenticated using (request_id in (select public.my_visible_request_ids()));

-- Analytics reads only status-change history.
create index if not exists request_comments_status_events_idx
  on public.request_comments(request_id, created_at) where kind = 'status_change';
create index if not exists requests_board_archived_idx on public.requests(board_id, archived_at);

-- ---------------------------------------------------------------------------
-- Verify nothing changed for anyone
-- ---------------------------------------------------------------------------
select pg_temp.rls_snapshot('after');

do $$
declare
  mismatch record;
begin
  select b.user_id, b.table_name into mismatch
  from rls_check b
  join rls_check a on a.user_id = b.user_id and a.table_name = b.table_name and a.phase = 'after'
  where b.phase = 'before' and a.digest is distinct from b.digest
  limit 1;
  if found then
    raise exception 'Access check failed: user % would see different % rows. Migration rolled back.',
      mismatch.user_id, mismatch.table_name;
  end if;
  if (select count(*) from rls_check where phase = 'before') = 0 then
    raise exception 'Access check found no users to compare. Migration rolled back.';
  end if;
end $$;
