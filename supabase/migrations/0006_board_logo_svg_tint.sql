-- Optional colour for each board logo slot. When set, the logo is shown as a
-- single-colour silhouette in that colour (works best with SVG or transparent PNG).
alter table public.boards add column if not exists logo_dark_tint text;
alter table public.boards add column if not exists logo_light_tint text;
alter table public.boards drop constraint if exists boards_logo_tint_check;
alter table public.boards add constraint boards_logo_tint_check check (
  (logo_dark_tint is null or logo_dark_tint ~ '^#[0-9a-fA-F]{6}$')
  and (logo_light_tint is null or logo_light_tint ~ '^#[0-9a-fA-F]{6}$')
);
