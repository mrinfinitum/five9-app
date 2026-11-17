-- Per-client access to web analytics. Someone in web_analytics_viewers sees every
-- client (web and Meta ads), as before. Everyone else sees only the clients granted
-- here, and for each one, web (Google Analytics + Search Console) and/or Meta ads.
create table if not exists public.web_analytics_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  web boolean not null default true,
  meta boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, board_id),
  check (web or meta)
);
alter table public.web_analytics_access enable row level security;
revoke all on public.web_analytics_access from anon, authenticated;
