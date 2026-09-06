create or replace function public.join_live_workout_room_and_start(p_join_code text)
returns table(room_id uuid, workout_session_id uuid, room_name text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.live_workout_rooms%rowtype;
  existing_member public.live_workout_room_members%rowtype;
  host_session public.workout_sessions%rowtype;
  active_session_id uuid;
  new_session_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select lr.* into r
  from public.live_workout_rooms lr
  where lr.join_code=upper(trim(p_join_code)) and lr.status='open';
  if r.id is null then raise exception 'Workout room not found or closed'; end if;

  select lrm.* into existing_member
  from public.live_workout_room_members lrm
  where lrm.room_id=r.id and lrm.athlete_user_id=auth.uid();

  if existing_member.workout_session_id is not null then
    return query select r.id, existing_member.workout_session_id, r.room_name;
    return;
  end if;

  select ws.id into active_session_id
  from public.workout_sessions ws
  where ws.athlete_user_id=auth.uid() and ws.status='in_progress'
  order by ws.started_at desc
  limit 1;
  if active_session_id is not null then
    raise exception 'You already have a workout in progress. Finish or cancel it before joining this room.';
  end if;

  select ws.* into host_session
  from public.workout_sessions ws
  where ws.id=r.host_session_id;
  if host_session.id is null then raise exception 'Host workout session not found'; end if;

  insert into public.workout_sessions(athlete_user_id,workout_id,workout_name_snapshot,status,started_at)
  values(auth.uid(),null,host_session.workout_name_snapshot,'in_progress',now())
  returning id into new_session_id;

  insert into public.exercise_sessions(workout_session_id,workout_exercise_id,exercise_id,exercise_name_snapshot,position,prescribed_set_targets_snapshot)
  select new_session_id,null,es.exercise_id,es.exercise_name_snapshot,es.position,coalesce(es.prescribed_set_targets_snapshot,'{}'::text[])
  from public.exercise_sessions es
  where es.workout_session_id=r.host_session_id
  order by es.position;

  insert into public.live_workout_room_members(room_id,athlete_user_id,workout_session_id)
  values(r.id,auth.uid(),new_session_id)
  on conflict on constraint live_workout_room_members_room_id_athlete_user_id_key
  do update set workout_session_id=excluded.workout_session_id;

  return query select r.id,new_session_id,r.room_name;
end
$function$;
