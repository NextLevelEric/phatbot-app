-- Secure coach-only workout template import.
-- Coaches keep read-only RLS on athlete-owned workout tables; this function is the
-- narrow write path for creating/updating an athlete's reusable workout templates.

create or replace function public.import_coach_workout_templates(
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
  v_workout_id uuid;
  v_exercise_id uuid;
  v_position integer;
  v_name text;
  v_notes text;
  v_targets text[];
  v_created integer := 0;
  v_updated integer := 0;
begin
  if v_coach is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.coach_athletes
    where coach_user_id = v_coach
      and athlete_user_id = p_athlete_user_id
      and active = true
  ) then raise exception 'Active coach-athlete link required'; end if;
  if jsonb_typeof(p_workouts) <> 'array' then raise exception 'Workouts must be a JSON array'; end if;

  for v_workout in select value from jsonb_array_elements(p_workouts)
  loop
    v_name := nullif(trim(v_workout->>'name'), '');
    if v_name is null then raise exception 'Every workout requires a name'; end if;

    select id into v_workout_id
    from public.workouts
    where athlete_user_id = p_athlete_user_id
      and lower(trim(name)) = lower(v_name)
      and is_active = true
    order by updated_at desc
    limit 1;

    if v_workout_id is null then
      insert into public.workouts(athlete_user_id,name,description,is_active)
      values (p_athlete_user_id,v_name,'Imported by coach ' || v_coach::text,true)
      returning id into v_workout_id;
      v_created := v_created + 1;
    else
      update public.workouts
      set name = v_name, updated_at = now()
      where id = v_workout_id;
      delete from public.workout_exercises where workout_id = v_workout_id;
      v_updated := v_updated + 1;
    end if;

    v_position := 0;
    for v_exercise in select value from jsonb_array_elements(coalesce(v_workout->'exercises','[]'::jsonb))
    loop
      v_name := nullif(trim(v_exercise->>'name'), '');
      if v_name is null then continue; end if;
      v_position := v_position + 1;
      v_notes := nullif(trim(coalesce(v_exercise->>'notes','')), '');

      select id into v_exercise_id
      from public.exercises
      where normalized_name = lower(trim(v_name))
      order by (created_by is null) desc, created_at asc
      limit 1;

      if v_exercise_id is null then
        insert into public.exercises(name,created_by)
        values (v_name,v_coach)
        returning id into v_exercise_id;
      end if;

      select coalesce(array_agg(nullif(trim(value), '') order by ordinality) filter (where nullif(trim(value), '') is not null), '{}'::text[])
      into v_targets
      from jsonb_array_elements_text(coalesce(v_exercise->'targets','[]'::jsonb)) with ordinality as t(value, ordinality);

      insert into public.workout_exercises(
        workout_id,exercise_id,position,notes,prescribed_set_targets
      ) values (
        v_workout_id,v_exercise_id,v_position,v_notes,v_targets
      );
    end loop;
  end loop;

  return jsonb_build_object('created',v_created,'updated',v_updated);
end;
$$;

revoke all on function public.import_coach_workout_templates(uuid,jsonb) from public;
grant execute on function public.import_coach_workout_templates(uuid,jsonb) to authenticated;
