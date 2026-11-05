-- Security hardening.

-- 1. An attachment row can only point at a file stored under its own request
--    (`<request id>/<file>`), with no path traversal. Otherwise a board member
--    could insert a row naming another board's file, then open or delete it
--    through the app (which signs and removes files with the service key).
--    NOT VALID: enforced for every new row without re-checking old ones.
alter table public.request_attachments drop constraint if exists request_attachments_path_in_request;
alter table public.request_attachments
  add constraint request_attachments_path_in_request
  check (storage_path like request_id::text || '/%' and storage_path not like '%..%')
  not valid;

-- 2. The access-check helpers only mean something for signed-in users, so
--    signed-out (anon) API callers can't call them at all.
revoke execute on function public.is_active_member() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.board_access(uuid) from public, anon;
revoke execute on function public.can_work_board(uuid) from public, anon;
revoke execute on function public.has_team_access() from public, anon;
revoke execute on function public.can_view_request(uuid) from public, anon;
revoke execute on function public.can_work_request(uuid) from public, anon;
revoke execute on function public.my_team_board_ids() from public, anon;
revoke execute on function public.my_board_ids() from public, anon;
revoke execute on function public.my_workable_request_ids() from public, anon;
revoke execute on function public.my_visible_request_ids() from public, anon;

grant execute on function public.is_active_member() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.board_access(uuid) to authenticated, service_role;
grant execute on function public.can_work_board(uuid) to authenticated, service_role;
grant execute on function public.has_team_access() to authenticated, service_role;
grant execute on function public.can_view_request(uuid) to authenticated, service_role;
grant execute on function public.can_work_request(uuid) to authenticated, service_role;
grant execute on function public.my_team_board_ids() to authenticated, service_role;
grant execute on function public.my_board_ids() to authenticated, service_role;
grant execute on function public.my_workable_request_ids() to authenticated, service_role;
grant execute on function public.my_visible_request_ids() to authenticated, service_role;
