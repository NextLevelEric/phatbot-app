-- Workout pause and stale-session lifecycle.
-- Paused is intentionally modeled as metadata on an in_progress session so
-- existing scoring/reporting code does not mistake a pause for completion.

alter table public.workout_sessions
  add column if not exists paused_at timestamptz,
  add column if not exists total_paused_seconds integer not null default 0,
  add column if not exists pause_reason text;

alter table public.workout_sessions
  drop constraint if exists workout_sessions_total_paused_seconds_check;
alter table public.workout_sessions
  add constraint workout_sessions_total_paused_seconds_check check (total_paused_seconds >= 0);

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


-- Paused athletes leave the live room race until they resume.
create or replace function public.get_live_workout_room_standings(
  p_room_id uuid,
  p_competition public.competition_kind
)
returns table(
  athlete_user_id uuid,
  athlete_name text,
  workout_session_id uuid,
  session_status text,
  competition public.competition_kind,
  score numeric,
  result_label text,
  detail_label text,
  evidence_count integer,
  rank bigint
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if p_competition not in ('beast'::public.competition_kind, 'eager_beaver'::public.competition_kind) then
    raise exception 'Train Together currently supports Beast and Eager Beaver';
  end if;
  if not exists (
    select 1 from public.live_workout_rooms r
    where r.id = p_room_id
      and (r.host_user_id = caller or exists (
        select 1 from public.live_workout_room_members m
        where m.room_id = r.id and m.athlete_user_id = caller
      ))
  ) then raise exception 'Not authorized to view this Train Together room'; end if;

  if p_competition = 'beast'::public.competition_kind then
    return query
    select b.athlete_user_id,b.athlete_name,b.workout_session_id,b.session_status,
      'beast'::public.competition_kind,b.score,b.result_label,
      case when b.comparable_exercises > 0
        then b.comparable_exercises::text || ' comparable lift' || case when b.comparable_exercises=1 then '' else 's' end
        else 'Building baseline' end,
      b.comparable_exercises,b.rank
    from public.get_live_workout_room_beast(p_room_id) b
    join public.workout_sessions active_ws on active_ws.id=b.workout_session_id
    where active_ws.paused_at is null;
    return;
  end if;

  return query
  with members as (
    select m.athlete_user_id,m.workout_session_id,ws.status::text session_status,
      coalesce(nullif(trim(p.display_name),''),'PHATBOT Athlete') athlete_name
    from public.live_workout_room_members m
    join public.workout_sessions ws on ws.id=m.workout_session_id
    left join public.profiles p on p.id=m.athlete_user_id
    where m.room_id=p_room_id and ws.paused_at is null
  ),
  exercise_rollup as (
    select mem.athlete_user_id,mem.workout_session_id,mem.session_status,mem.athlete_name,
      count(xs.id) filter(where xs.result='progression')::numeric progression_count,
      count(xs.id) filter(where xs.result='neutral')::numeric neutral_count,
      count(xs.id) filter(where xs.result='regression')::numeric regression_count,
      count(xs.id) filter(where xs.result in ('progression','neutral','regression'))::numeric opportunities
    from members mem
    left join public.exercise_sessions es on es.workout_session_id=mem.workout_session_id
    left join public.exercise_scores xs on xs.exercise_session_id=es.id and xs.athlete_user_id=mem.athlete_user_id
    group by mem.athlete_user_id,mem.workout_session_id,mem.session_status,mem.athlete_name
  ),
  scored as (
    select *,
      case when opportunities>0
        then round(((progression_count + neutral_count*0.5 + 2.0)/nullif(opportunities+4.0,0))*100,2)
      end eager_score
    from exercise_rollup
  ),
  ranked as (
    select *,case when eager_score is not null then rank() over(order by eager_score desc nulls last) end eager_rank
    from scored
  )
  select athlete_user_id,athlete_name,workout_session_id,session_status,
    'eager_beaver'::public.competition_kind,eager_score,
    case
      when eager_score is not null and session_status='completed' then round(eager_score,1)::text || ' Eager'
      when eager_score is not null then round(eager_score,1)::text || ' Eager so far'
      when session_status='cancelled' then 'Workout ended'
      else 'Log a comparable exercise'
    end,
    case when opportunities>0
      then progression_count::integer::text || ' PO win' || case when progression_count=1 then '' else 's' end ||
        ' · ' || opportunities::integer::text || ' opportunit' || case when opportunities=1 then 'y' else 'ies' end
      else 'No comparable PO opportunities yet' end,
    opportunities::integer,eager_rank
  from ranked
  order by eager_score desc nulls last,athlete_name;
end
$function$;


revoke all on function public.get_live_workout_room_standings(uuid, public.competition_kind) from public, anon;
grant execute on function public.get_live_workout_room_standings(uuid, public.competition_kind) to authenticated;
