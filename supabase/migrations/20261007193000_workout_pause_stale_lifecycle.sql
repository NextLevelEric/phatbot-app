-- Workout pause and stale-session lifecycle.
-- Paused is intentionally modeled as metadata on an in_progress session so
-- existing scoring/reporting code does not mistake a pause for completion.

alter table public.workout_sessions
  add column if not exists paused_at timestamptz,
  add column if not exists pause_reason text;

alter table public.workout_sessions
  drop constraint if exists workout_sessions_pause_reason_check;
alter table public.workout_sessions
  add constraint workout_sessions_pause_reason_check
  check (pause_reason is null or pause_reason in ('athlete','inactive'));

create or replace function public.reconcile_my_stale_workouts()
returns table(session_id uuid, action text)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'Authentication required'; end if;

  -- Anything intentionally or automatically paused for 24 hours is abandoned.
  return query
  with stale as (
    select ws.id
    from public.workout_sessions ws
    where ws.athlete_user_id=caller
      and ws.status='in_progress'
      and ws.paused_at is not null
      and ws.paused_at <= now() - interval '24 hours'
  ), updated as (
    update public.workout_sessions ws
    set status='cancelled',updated_at=now()
    from stale
    where ws.id=stale.id
    returning ws.id
  )
  select id,'abandoned'::text from updated;

  -- Active sessions with no set activity for 90 minutes are safely paused.
  return query
  with activity as (
    select ws.id,greatest(ws.started_at,coalesce(max(s.created_at),ws.started_at)) last_activity
    from public.workout_sessions ws
    left join public.exercise_sessions es on es.workout_session_id=ws.id
    left join public.sets s on s.exercise_session_id=es.id
    where ws.athlete_user_id=caller and ws.status='in_progress' and ws.paused_at is null
    group by ws.id,ws.started_at
  ), stale as (
    select id from activity where last_activity <= now() - interval '90 minutes'
  ), updated as (
    update public.workout_sessions ws
    set paused_at=now(),pause_reason='inactive',updated_at=now()
    from stale where ws.id=stale.id
    returning ws.id
  )
  select id,'paused'::text from updated;
end
$function$;

revoke all on function public.reconcile_my_stale_workouts() from public,anon;
grant execute on function public.reconcile_my_stale_workouts() to authenticated;
