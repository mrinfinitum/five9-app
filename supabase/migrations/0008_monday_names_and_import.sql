-- Status names now match monday.com: Not Started, On Hold, In Progress, In Review,
-- Completed, Cancelled. Keys are unchanged.
create or replace function public.request_status_name(status_key text)
returns text language sql immutable as $$
  select case status_key
    when 'new' then 'Not Started'
    when 'waiting' then 'On Hold'
    when 'in_progress' then 'In Progress'
    when 'creative_review' then 'In Review'
    when 'completed' then 'Completed'
    when 'cancelled' then 'Cancelled'
    else status_key
  end;
$$;

-- Where an imported request came from (e.g. "monday:1234567890"), so imports never duplicate.
alter table public.requests add column if not exists external_ref text;
create unique index if not exists requests_external_ref_idx on public.requests(external_ref) where external_ref is not null;
alter table public.request_comments add column if not exists external_ref text;
create unique index if not exists request_comments_external_ref_idx on public.request_comments(external_ref) where external_ref is not null;
