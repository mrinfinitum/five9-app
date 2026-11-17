-- Meta (Facebook/Instagram) ad account for each client board, shown in web analytics.
-- Stored as the bare number (the API's "act_" prefix is added when calling Meta).
alter table public.web_analytics_sites
  add column if not exists meta_ad_account_id text check (meta_ad_account_id ~ '^[0-9]{1,25}$');
