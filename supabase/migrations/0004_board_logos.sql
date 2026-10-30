-- Optional logo per board. Files live in the public "board-logos" storage bucket.
alter table public.boards add column if not exists logo_path text;
alter table public.boards add column if not exists logo_background text not null default 'dark';
alter table public.boards drop constraint if exists boards_logo_background_check;
alter table public.boards add constraint boards_logo_background_check check (logo_background in ('dark', 'light'));
