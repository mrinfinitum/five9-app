-- Fixes from the November 2026 pen test.

-- People who belong on a board: its members, plus admins (Five9 staff).
create or replace function public.is_board_person(target_board uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_user
      and p.is_active
      and (p.role = 'admin' or exists (select 1 from public.board_members bm where bm.board_id = target_board and bm.user_id = target_user))
  );
$$;

-- Everyone who shares a board with the caller (for reading names and contact details).
create or replace function public.my_board_people()
returns setof uuid language sql stable security definer set search_path = public as $$
  select bm.user_id from public.board_members bm where bm.board_id in (select public.my_board_ids());
$$;

revoke execute on function public.is_board_person(uuid, uuid) from public, anon;
revoke execute on function public.my_board_people() from public, anon;
grant execute on function public.is_board_person(uuid, uuid) to authenticated, service_role;
grant execute on function public.my_board_people() to authenticated, service_role;

-- 1. Profiles: members could read every user's email and phone across all
--    clients. Now: yourself, admins see everyone, members see people on their
--    own boards and Five9 staff (admins).
drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or (
      (select public.is_active_member())
      and (role = 'admin' or id in (select public.my_board_people()))
    )
  );

-- 2. Request categories are shared by every board: only admins change them.
drop policy if exists "team adds request types" on public.request_types;
create policy "team adds request types" on public.request_types
  for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "team updates request types" on public.request_types;
create policy "team updates request types" on public.request_types
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- 3. Requesters and assignees must belong on the request's board, so nobody
--    can pull an outsider into a request (and its emails).
create or replace function public.check_request_person()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_board uuid;
  target_user uuid;
begin
  if tg_table_name = 'requests' then
    target_board := new.board_id;
    target_user := new.requester_id;
  else
    select r.board_id into target_board from public.requests r where r.id = new.request_id;
    target_user := new.user_id;
  end if;
  if target_user is not null and not public.is_board_person(target_board, target_user) then
    raise exception 'That person is not on this board.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_request_person() from public, anon, authenticated;

drop trigger if exists requests_check_requester on public.requests;
create trigger requests_check_requester
  before insert or update of requester_id on public.requests
  for each row execute function public.check_request_person();

drop trigger if exists request_assignees_check_user on public.request_assignees;
create trigger request_assignees_check_user
  before insert or update of user_id, request_id on public.request_assignees
  for each row execute function public.check_request_person();
