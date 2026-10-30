-- Boards can have separate logos for dark and light mode.
-- logo_path = logo shown in dark mode; logo_light_path = logo shown in light mode.
-- When only one is uploaded it's used in both modes.
alter table public.boards add column if not exists logo_light_path text;
