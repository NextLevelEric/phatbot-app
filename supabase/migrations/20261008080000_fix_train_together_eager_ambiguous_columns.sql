-- Fix PL/pgSQL output-variable collisions in the Eager Beaver CTE.
CREATE OR REPLACE FUNCTION public.get_live_workout_room_standings(p_room_id uuid, p_competition competition_kind)
 RETURNS TABLE(athlete_user_id uuid, athlete_name text, workout_session_id uuid, session_status text, competition competition_kind, score numeric, result_label text, detail_label text, evidence_count integer, rank bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
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
$function$
;
