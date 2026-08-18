-- Coach dashboard access policies.
-- Keeps athlete self-access intact while allowing a signed-in coach to
-- create their coach profile and read basic profile data for linked athletes.

create policy coach_profiles_insert_own on public.coach_profiles
for insert with check (user_id = auth.uid());

create policy profiles_read_linked_athletes on public.profiles
for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.coach_athletes ca
    where ca.athlete_user_id = profiles.id
      and ca.coach_user_id = auth.uid()
      and ca.active = true
  )
);

create policy coach_athletes_manage_own on public.coach_athletes
for all using (coach_user_id = auth.uid())
with check (coach_user_id = auth.uid());
