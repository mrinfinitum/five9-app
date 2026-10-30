-- One level of board access: a member of a board has full control of it.
-- Former "requester" memberships become full memberships, and the column only
-- accepts 'team' from now on (the access rules already treat 'team' as full).
update public.board_members set access = 'team' where access <> 'team';

alter table public.board_members drop constraint if exists board_members_access_check;
alter table public.board_members alter column access set default 'team';
alter table public.board_members add constraint board_members_access_check check (access = 'team');
