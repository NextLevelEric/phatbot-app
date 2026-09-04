-- PHATBOT competition scoring engine V1
-- Server-side rebuild/finalization. All dates are supplied as absolute timestamptz
-- so callers can create America/New_York daily and Sunday-Saturday weekly periods.

create or replace function public.phatbot_rebuild_competition_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_period public.competition_periods%rowtype;
begin
  select * into v_period from public.competition_periods where id=p_period_id for update;
  if not found then raise exception 'Competition period not found'; end if;
  if v_period.status='finalized' then raise exception 'Finalized competition periods are immutable'; end if;

  delete from public.competition_entries where period_id=p_period_id;

  if v_period.competition='eager_beaver' then
    insert into public.competition_entries(period_id,athlete_user_id,score,result_label,explanation,source_ref)
    select p_period_id, ws.athlete_user_id,
      round(avg(wsc.score)*100,2),
      round(avg(wsc.score)*100,0)::text||'% PO',
      count(*)::text||' scored workout'||case when count(*)=1 then '' else 's' end,
      jsonb_build_object('scored_workouts',count(*))
    from public.workout_sessions ws
    join public.workout_scores wsc on wsc.workout_session_id=ws.id
    where ws.status='completed' and coalesce(ws.is_test,false)=false
      and ws.completed_at>=v_period.period_start and ws.completed_at<v_period.period_end
      and wsc.scored_exercise_count>0
    group by ws.athlete_user_id;

  elsif v_period.competition='step_king' then
    insert into public.competition_entries(period_id,athlete_user_id,score,result_label,explanation,source_ref)
    select p_period_id, h.athlete_user_id, sum(h.steps)::numeric,
      to_char(sum(h.steps),'FM999,999,999')||' steps',
      case when v_period.cadence='daily' then 'Valid daily steps' else 'Valid steps across the competition week' end,
      jsonb_build_object('days',count(*))
    from public.health_daily_metrics h
    where h.metric_date >= (v_period.period_start at time zone 'America/New_York')::date
      and h.metric_date < (v_period.period_end at time zone 'America/New_York')::date
      and h.steps is not null and h.steps>=0
    group by h.athlete_user_id;

  elsif v_period.competition='cardio_bunny' then
    -- V1 compares each eligible activity with that athlete's most recent prior
    -- activity of the same type whose distance and duration are each within 10%.
    -- Score is the strongest normalized pace improvement, capped at +50%.
    with candidates as (
      select c.*, prev.duration_seconds prior_duration, prev.distance_meters prior_distance
      from public.cardio_activities c
      left join lateral (
        select p.duration_seconds,p.distance_meters
        from public.cardio_activities p
        where p.athlete_user_id=c.athlete_user_id and p.activity_type=c.activity_type
          and p.started_at<c.started_at
          and p.duration_seconds>0 and p.distance_meters>0
          and abs(p.distance_meters-c.distance_meters)/nullif(c.distance_meters,0)<=0.10
          and abs(p.duration_seconds-c.duration_seconds)/nullif(c.duration_seconds,0)<=0.10
        order by p.started_at desc limit 1
      ) prev on true
      where c.started_at>=v_period.period_start and c.started_at<v_period.period_end
        and c.duration_seconds>0 and c.distance_meters>0
    ), scored as (
      select *, least(50::numeric,greatest(-100::numeric,
        ((prior_duration/nullif(prior_distance,0))/(duration_seconds/nullif(distance_meters,0))-1)*100)) improvement
      from candidates where prior_duration is not null
    ), best as (
      select distinct on (athlete_user_id) * from scored order by athlete_user_id, improvement desc, started_at asc
    )
    insert into public.competition_entries(period_id,athlete_user_id,score,result_label,explanation,source_ref)
    select p_period_id,athlete_user_id,round(improvement,2),
      (case when improvement>=0 then '+' else '' end)||round(improvement,1)::text||'% pace',
      coalesce(activity_name,'Comparable cardio')||' versus prior comparable effort',
      jsonb_build_object('activity_id',id,'activity_type',activity_type)
    from best;

  elsif v_period.competition='beast' then
    -- Uses deterministic exercise PO scores already produced by PHATBOT.
    -- Baselines do not compete. A workout's eligible exercise results are
    -- weighted by scoring_weight; with 3+ exercises no exercise may contribute
    -- more than 35% of the workout weight. Athlete result is strongest eligible
    -- completed workout in the period. Final score is capped at +50%.
    with eligible as (
      select ws.athlete_user_id,ws.id workout_session_id,ws.completed_at,
        es.score,coalesce(es.scoring_weight,1)::numeric raw_weight,
        count(*) over(partition by ws.id) exercise_count
      from public.workout_sessions ws
      join public.exercise_scores es on es.workout_session_id=ws.id
      where ws.status='completed' and coalesce(ws.is_test,false)=false
        and ws.completed_at>=v_period.period_start and ws.completed_at<v_period.period_end
        and es.result::text<>'baseline' and es.score is not null
    ), weighted as (
      select *,case when exercise_count>=3 then least(raw_weight,0.35*sum(raw_weight) over(partition by workout_session_id)) else raw_weight end adj_weight
      from eligible
    ), workout_results as (
      select athlete_user_id,workout_session_id,min(completed_at) completed_at,
        least(50::numeric,round(sum(score*adj_weight)/nullif(sum(adj_weight),0)*100,2)) beast_score,
        count(*) exercise_count
      from weighted group by athlete_user_id,workout_session_id
    ), best as (
      select distinct on (athlete_user_id) * from workout_results
      order by athlete_user_id,beast_score desc,completed_at asc,workout_session_id
    )
    insert into public.competition_entries(period_id,athlete_user_id,score,result_label,explanation,source_ref)
    select p_period_id,athlete_user_id,beast_score,
      (case when beast_score>=0 then '+' else '' end)||round(beast_score,1)::text||'% improvement',
      exercise_count::text||' eligible exercise'||case when exercise_count=1 then '' else 's' end,
      jsonb_build_object('workout_session_id',workout_session_id,'eligible_exercises',exercise_count)
    from best;
  end if;

  -- Competition ranking semantics: ties consume places (1,1,3 / 1,2,2,4).
  with ranked as (
    select id,rank() over(order by score desc) r from public.competition_entries
    where period_id=p_period_id and is_eligible=true
  )
  update public.competition_entries e set rank=r.r,updated_at=now() from ranked r where e.id=r.id;
end
$$;

create or replace function public.phatbot_finalize_competition_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_status public.competition_period_status;
begin
  select status into v_status from public.competition_periods where id=p_period_id for update;
  if not found then raise exception 'Competition period not found'; end if;
  if v_status='finalized' then return; end if;
  update public.competition_periods set status='reconciling' where id=p_period_id;
  perform public.phatbot_rebuild_competition_period(p_period_id);
  insert into public.competition_awards(period_id,athlete_user_id,rank,award_key)
  select e.period_id,e.athlete_user_id,e.rank,
    p.competition::text||'_'||p.cadence::text
  from public.competition_entries e join public.competition_periods p on p.id=e.period_id
  where e.period_id=p_period_id and e.rank=1 and e.is_eligible=true
  on conflict do nothing;
  update public.competition_periods set status='finalized',finalized_at=now() where id=p_period_id;
end
$$;

revoke all on function public.phatbot_rebuild_competition_period(uuid) from public,anon,authenticated;
revoke all on function public.phatbot_finalize_competition_period(uuid) from public,anon,authenticated;
