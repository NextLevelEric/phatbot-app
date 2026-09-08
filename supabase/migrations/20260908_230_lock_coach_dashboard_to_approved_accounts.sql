alter table public.coach_profiles add column if not exists dashboard_enabled boolean not null default false;

-- PHATBOT consumer coach access is intentionally allowlisted. Eric is the
-- canonical coach; future coach testers can be explicitly enabled without
-- reopening coach mode to ordinary athletes.
update public.coach_profiles
set dashboard_enabled = (user_id = 'd8bfdf85-d317-423f-baaa-9cdc02566c7e'::uuid);

create or replace function public.has_coach_dashboard_access(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.coach_profiles
    where user_id = p_user_id and dashboard_enabled = true
  );
$$;

grant execute on function public.has_coach_dashboard_access(uuid) to authenticated;
