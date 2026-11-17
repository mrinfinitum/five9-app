-- Security page: scheduled scans of the app and client sites, and what they found.
-- Read and written only by the server with the service key (admins only), so
-- RLS is on with no policies.

create table if not exists public.security_scans (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'schedule' check (trigger in ('schedule', 'manual')),
  started_by uuid references public.profiles(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  targets text[] not null default '{}',
  checks_run integer not null default 0,
  error text
);
alter table public.security_scans enable row level security;

create table if not exists public.security_findings (
  id uuid primary key default gen_random_uuid(),
  -- Same check on the same target is the same finding across scans.
  fingerprint text not null unique,
  target text not null,
  check_key text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  title text not null,
  detail text not null default '',
  fix_hint text not null default '',
  -- Only findings in this app's own code can be fixed by a Claude PR.
  fixable boolean not null default false,
  status text not null default 'open' check (status in ('open', 'fixing', 'fixed', 'ignored')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  resolved_at timestamptz,
  fix_issue_url text,
  fix_requested_at timestamptz,
  fix_requested_by uuid references public.profiles(id) on delete set null
);
alter table public.security_findings enable row level security;
create index if not exists security_findings_status_idx on public.security_findings(status, severity);

revoke all on public.security_scans from anon, authenticated;
revoke all on public.security_findings from anon, authenticated;
