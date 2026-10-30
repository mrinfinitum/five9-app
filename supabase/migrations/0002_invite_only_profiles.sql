-- Invite-only safety net: accounts created by self sign-up (not via an admin
-- invite) start deactivated, so they can't see or change anything even if
-- public sign-ups are left on in Supabase Auth settings.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, is_active)
  values (
    new.id,
    lower(new.email),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    new.invited_at is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
