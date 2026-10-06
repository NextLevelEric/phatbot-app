-- Train Like This Athlete MVP.
-- Exposes only the planned structure of a completed session belonging to an athlete
-- whose leaderboard identity is visible, then copies that structure into the caller's
-- own workout library. Performed weights/reps, notes, and history are never copied.

create or replace function public.athlete_shared_workout(p_workout_session_id uuid)
returns table(
  workout_session_id uuid,
  athlete_user_id uuid,
  athlete_name text,
  workout_name text,
  completed_at timestamptz,
  exercises jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with source_session as (
    select ws.id, ws.athlete_user_id, ws.workout_name_snapshot, ws.completed_at
    from public.workout_sessions ws
    join public.athlete_profiles ap on ap.user_id = ws.athlete_user_id
    where ws.id = p_workout_session_id
      and ws.status = 'completed'
      and coalesce(ws.is_test,false) = false
      and (select auth.uid()) is not null
      and (
        ws.athlete_user_id = (select auth.uid())
        or ap.leaderboard_identity_mode in ('profile','custom')
      )
  ),
  source_name as (
    select
      ss.*,
      case
        when ss.athlete_user_id = (select auth.uid()) then coalesce(nullif(trim(p.display_name),''),'PHATBOT Athlete')
        when ap.leaderboard_identity_mode = 'profile' then coalesce(nullif(trim(p.display_name),''),'PHATBOT Athlete')
        else coalesce(nullif(trim(ap.leaderboard_name),''),'PHATBOT Athlete')
      end as athlete_name
    from source_session ss
    join public.athlete_profiles ap on ap.user_id = ss.athlete_user_id
    join public.profiles p on p.id = ss.athlete_user_id
  )
  select
    sn.id,
    sn.athlete_user_id,
    sn.athlete_name,
    sn.workout_name_snapshot,
    sn.completed_at,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'exercise_id', es.exercise_id,
        'name', es.exercise_name_snapshot,
        'position', es.position,
        'prescribed_set_targets', coalesce(es.prescribed_set_targets_snapshot,'{}'::text[]),
        'target_rounds', es.target_rounds_snapshot,
        'target_duration_seconds_min', es.target_duration_seconds_min_snapshot,
        'target_duration_seconds_max', es.target_duration_seconds_max_snapshot,
        'target_distance', es.target_distance_snapshot,
        'target_distance_unit', es.target_distance_unit_snapshot
      ) order by es.position
    ) filter (where es.id is not null), '[]'::jsonb)
  from source_name sn
  left join public.exercise_sessions es on es.workout_session_id = sn.id
  group by sn.id, sn.athlete_user_id, sn.athlete_name, sn.workout_name_snapshot, sn.completed_at;
$$;

create or replace function public.copy_athlete_workout(p_workout_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  source_record record;
  new_workout_id uuid;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  select ws.id, ws.athlete_user_id, ws.workout_name_snapshot
  into source_record
  from public.workout_sessions ws
  join public.athlete_profiles ap on ap.user_id = ws.athlete_user_id
  where ws.id = p_workout_session_id
    and ws.status = 'completed'
    and coalesce(ws.is_test,false) = false
    and (
      ws.athlete_user_id = caller
      or ap.leaderboard_identity_mode in ('profile','custom')
    );

  if source_record.id is null then
    raise exception 'Workout is unavailable for copying';
  end if;

  insert into public.workouts (athlete_user_id, name, description, is_active, sort_order)
  values (
    caller,
    left(source_record.workout_name_snapshot || case when source_record.athlete_user_id = caller then ' · Copy' else ' · Copied' end, 80),
    'Copied from a PHATBOT athlete workout',
    true,
    coalesce((select max(w.sort_order) + 1 from public.workouts w where w.athlete_user_id = caller), 1)
  )
  returning id into new_workout_id;

  insert into public.workout_exercises (
    workout_id, exercise_id, position, target_rep_min, target_rep_max,
    minimum_progression_reps, scoring_weight, prescribed_set_targets,
    target_rounds, target_duration_seconds_min, target_duration_seconds_max,
    target_distance, target_distance_unit
  )
  select
    new_workout_id,
    es.exercise_id,
    es.position,
    case
      when cardinality(es.prescribed_set_targets_snapshot) > 0
        and es.prescribed_set_targets_snapshot[1] ~ '^[0-9]+$'
      then es.prescribed_set_targets_snapshot[1]::integer
      when cardinality(es.prescribed_set_targets_snapshot) > 0
        and es.prescribed_set_targets_snapshot[1] ~ '^[0-9]+-[0-9]+$'
      then split_part(es.prescribed_set_targets_snapshot[1],'-',1)::integer
      else null
    end,
    case
      when cardinality(es.prescribed_set_targets_snapshot) > 0
        and es.prescribed_set_targets_snapshot[1] ~ '^[0-9]+$'
      then es.prescribed_set_targets_snapshot[1]::integer
      when cardinality(es.prescribed_set_targets_snapshot) > 0
        and es.prescribed_set_targets_snapshot[1] ~ '^[0-9]+-[0-9]+$'
      then split_part(es.prescribed_set_targets_snapshot[1],'-',2)::integer
      else null
    end,
    1,
    1.000,
    coalesce(es.prescribed_set_targets_snapshot,'{}'::text[]),
    es.target_rounds_snapshot,
    es.target_duration_seconds_min_snapshot,
    es.target_duration_seconds_max_snapshot,
    es.target_distance_snapshot,
    es.target_distance_unit_snapshot
  from public.exercise_sessions es
  where es.workout_session_id = source_record.id
  order by es.position;

  if not exists (select 1 from public.workout_exercises we where we.workout_id = new_workout_id) then
    delete from public.workouts where id = new_workout_id;
    raise exception 'Workout has no exercises to copy';
  end if;

  return new_workout_id;
end;
$$;

revoke all on function public.athlete_shared_workout(uuid) from public, anon;
revoke all on function public.copy_athlete_workout(uuid) from public, anon;
grant execute on function public.athlete_shared_workout(uuid) to authenticated;
grant execute on function public.copy_athlete_workout(uuid) to authenticated;
