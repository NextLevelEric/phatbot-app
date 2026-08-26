create or replace function public.link_workout_session_to_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workout_id is null then
    select w.id into new.workout_id
    from public.workouts w
    where w.athlete_user_id = new.athlete_user_id
      and lower(trim(w.name)) = lower(trim(new.workout_name_snapshot))
    order by w.is_active desc, w.updated_at desc, w.created_at desc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists workout_sessions_link_template on public.workout_sessions;
create trigger workout_sessions_link_template
before insert or update of workout_id, workout_name_snapshot on public.workout_sessions
for each row execute function public.link_workout_session_to_template();

create or replace function public.link_existing_history_when_workout_saved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workout_sessions ws
  set workout_id = new.id
  where ws.athlete_user_id = new.athlete_user_id
    and ws.workout_id is null
    and lower(trim(ws.workout_name_snapshot)) = lower(trim(new.name));
  return new;
end;
$$;

drop trigger if exists workouts_link_existing_history on public.workouts;
create trigger workouts_link_existing_history
after insert or update of name on public.workouts
for each row execute function public.link_existing_history_when_workout_saved();

with matches as (
  select distinct on (ws.id)
    ws.id as session_id,
    w.id as workout_id
  from public.workout_sessions ws
  join public.workouts w
    on w.athlete_user_id = ws.athlete_user_id
   and lower(trim(w.name)) = lower(trim(ws.workout_name_snapshot))
  where ws.workout_id is null
  order by ws.id, w.is_active desc, w.updated_at desc, w.created_at desc
)
update public.workout_sessions ws
set workout_id = matches.workout_id
from matches
where ws.id = matches.session_id;
