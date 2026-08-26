-- Preserve historical timed work (for example Dead Hang 0:39 or 2:30)
-- as true timed sets instead of rep-based workload.

create or replace function public.import_coach_workout_history(
  p_athlete_user_id uuid,
  p_workouts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach uuid := auth.uid();
  v_workout jsonb;
  v_exercise jsonb;
  v_set jsonb;
  v_session_id uuid;
  v_exercise_session_id uuid;
  v_exercise_id uuid;
  v_completed_at timestamptz;
  v_position integer;
  v_set_number integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_name text;
  v_set_type public.set_type;
  v_duration integer;
begin
  if v_coach is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.coach_athletes
    where coach_user_id = v_coach and athlete_user_id = p_athlete_user_id and active = true
  ) then raise exception 'Active coach-athlete link required'; end if;
  if jsonb_typeof(p_workouts) <> 'array' then raise exception 'Workouts must be a JSON array'; end if;

  for v_workout in select value from jsonb_array_elements(p_workouts)
  loop
    v_name := nullif(trim(v_workout->>'workoutName'), '');
    if v_name is null or nullif(v_workout->>'date','') is null then
      raise exception 'Every historical workout requires workoutName and date';
    end if;
    v_completed_at := ((v_workout->>'date')::date + time '12:00') at time zone 'UTC';

    if exists (
      select 1 from public.workout_sessions ws
      where ws.athlete_user_id = p_athlete_user_id
        and ws.status = 'completed'
        and lower(trim(ws.workout_name_snapshot)) = lower(v_name)
        and ws.completed_at::date = v_completed_at::date
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.workout_sessions
      (athlete_user_id, workout_name_snapshot, status, started_at, completed_at, notes)
    values
      (p_athlete_user_id, v_name, 'completed', v_completed_at - interval '1 hour', v_completed_at,
       'Imported historical workout by coach ' || v_coach::text)
    returning id into v_session_id;

    v_position := 0;
    for v_exercise in select value from jsonb_array_elements(coalesce(v_workout->'exercises','[]'::jsonb))
    loop
      v_position := v_position + 1;
      v_name := nullif(trim(v_exercise->>'name'), '');
      if v_name is null then continue; end if;
      select id into v_exercise_id from public.exercises
       where normalized_name = lower(trim(v_name)) order by (created_by is null) desc limit 1;
      if v_exercise_id is null then
        insert into public.exercises(name, created_by) values (v_name, v_coach) returning id into v_exercise_id;
      end if;
      insert into public.exercise_sessions
        (workout_session_id, exercise_id, exercise_name_snapshot, position, notes)
      values
        (v_session_id, v_exercise_id, v_name, v_position, nullif(v_exercise->>'notes',''))
      returning id into v_exercise_session_id;

      v_set_number := 0;
      for v_set in select value from jsonb_array_elements(coalesce(v_exercise->'sets','[]'::jsonb))
      loop
        v_set_number := v_set_number + 1;
        v_set_type := case when lower(coalesce(v_set->>'setType','working')) = 'timed' then 'timed'::public.set_type else 'working'::public.set_type end;
        v_duration := case when v_set_type = 'timed' then greatest(1,coalesce((v_set->>'durationSeconds')::integer,0)) else null end;

        insert into public.sets(exercise_session_id,set_number,set_type,weight,reps,partial_reps,duration_seconds,notes)
        values (
          v_exercise_session_id, v_set_number, v_set_type,
          case when v_set_type='timed' then 0 else greatest(0, coalesce((v_set->>'weight')::numeric,0)) end,
          case when v_set_type='timed' then 0 else greatest(0, coalesce((v_set->>'reps')::integer,0)) end,
          case when v_set_type='timed' then 0 else greatest(0, coalesce((v_set->>'partialReps')::integer,0)) end,
          v_duration,
          case when v_set_type<>'timed' and coalesce((v_set->>'weight')::numeric,0) < 0
            then 'Imported assisted load: ' || (v_set->>'weight')
            else null end
        );
      end loop;
    end loop;
    v_imported := v_imported + 1;
  end loop;
  return jsonb_build_object('imported',v_imported,'duplicatesSkipped',v_skipped);
end;
$$;

revoke all on function public.import_coach_workout_history(uuid,jsonb) from public;
grant execute on function public.import_coach_workout_history(uuid,jsonb) to authenticated;
