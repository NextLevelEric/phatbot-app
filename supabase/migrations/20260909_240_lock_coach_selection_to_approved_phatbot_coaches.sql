alter table public.coach_profiles add column if not exists selectable_by_athletes boolean not null default false;

update public.coach_profiles cp
set selectable_by_athletes = true
from public.profiles p
where p.id = cp.user_id
  and p.display_name = 'Eric Parent'
  and cp.dashboard_enabled = true;

create or replace function public.add_eric_as_my_coach()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete uuid := auth.uid();
  v_coach uuid;
begin
  if v_athlete is null then raise exception 'Not authenticated'; end if;

  select cp.user_id into v_coach
  from public.coach_profiles cp
  join public.profiles p on p.id = cp.user_id
  where cp.selectable_by_athletes = true
    and cp.dashboard_enabled = true
    and p.display_name = 'Eric Parent'
  order by cp.created_at
  limit 1;

  if v_coach is null then raise exception 'Eric coach profile is unavailable'; end if;
  if v_coach = v_athlete then return v_coach; end if;

  update public.coach_athletes
  set active = false
  where athlete_user_id = v_athlete
    and coach_user_id <> v_coach
    and active = true;

  insert into public.coach_athletes(coach_user_id, athlete_user_id, active)
  values(v_coach, v_athlete, true)
  on conflict (coach_user_id, athlete_user_id)
  do update set active = true;

  return v_coach;
end;
$$;

grant execute on function public.add_eric_as_my_coach() to authenticated;
