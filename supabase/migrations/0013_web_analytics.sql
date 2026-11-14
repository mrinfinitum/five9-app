-- Web analytics (GA4 + Search Console) for client boards.
--
-- Both tables are read and written only by the server with the service key,
-- after it checks who's asking: RLS is on with no policies, so the public API
-- can't read or change them at all.

-- Who can open the web analytics dashboard. Granted by admins, one by one;
-- being an admin doesn't include it.
create table if not exists public.web_analytics_viewers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.web_analytics_viewers enable row level security;

-- Which GA4 property and Search Console site belong to each client board.
create table if not exists public.web_analytics_sites (
  board_id uuid primary key references public.boards(id) on delete cascade,
  ga4_property_id text check (ga4_property_id ~ '^[0-9]{1,20}$'),
  search_console_site text check (
    char_length(search_console_site) <= 300
    and (search_console_site like 'sc-domain:%' or search_console_site ~ '^https?://')
  ),
  updated_at timestamptz not null default now()
);
alter table public.web_analytics_sites enable row level security;

revoke all on public.web_analytics_viewers from anon, authenticated;
revoke all on public.web_analytics_sites from anon, authenticated;
