-- PHATBOT competition scoring V2
-- Beast = like-for-like set performance improvement plus a modest extra-set bonus.
-- Eager Beaver = consistency across PO opportunities with Bayesian shrinkage so
-- one perfect workout does not automatically beat sustained high-quality work.

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
    with athlete_po as (
      select ws.athlete_user_id,
        sum(wsc.progression_count)::numeric progression_count,
        sum(wsc.neutral_count)::numeric neutral_count,
        sum(wsc.regression_count)::numeric regression_count,
        sum(wsc.scored_exercise_count)::numeric opportunities,
        count(*)::integer workouts
      from public.workout_sessions ws
      join public.workout_scores wsc on wsc.workout_session_id=ws.id
      where ws.status='completed' and coalesce(ws.is_test,false)=false
        and ws.completed_at>=v_period.period_start and ws.completed_at<v_period.period_end
        and wsc.scored_exercise_count>0
      group by ws.athlete_user_id
    )
    insert into public.competition_entries(period_id,athlete_user_id,score,result_label,explanation,source_ref)
    select p_period_id,athlete_user_id,
      round(((progression_count + neutral_count*0.5 + 2.0) / nullif(opportunities + 4.0,0))*100,2),
      round(((progression_count + neutral_count*0.5 + 2.0) / nullif(opportunities + 4.0,0))*100,1)::text||' Eager score',
      progression_count::integer||' PO wins, '||neutral_count::integer||' neutral, '||regression_count::integer||' regression across '||opportunities::integer||' opportunities',
      jsonb_build_object('workouts',workouts,'opportunities',opportunities,'progressions',progression_count,'neutral',neutral_count,'regressions',regression_count,'method','bayesian_consistency_v2')
    from athlete_po;

  elsif v_period.competition='step_king' then
    insert into public.competition_entries(period_id,athlete_user_id,score,result_label,explanation,source_ref)
    select p_period_id,h.athlete_user_id,sum(h.steps)::numeric,
      to_char(sum(h.steps),'FM999,999,999')||' steps',
      case when v_period.cadence='daily' then 'Valid daily steps' else 'Valid steps across the competition week' end,
      jsonb_build_object('days',count(*))
    from public.health_daily_metrics h
    where h.metric_date >= (v_period.period_start at time zone 'America/New_York')::date
      and h.metric_date < (v_period.period_end at time zone 'America/New_York')::date
      and h.steps is not null and h.steps>=0
    group by h.athlete_user_id;

  elsif v_period.competition='cardio_bunny' then
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
    with eligible_exercises as (
      select ws.athlete_user_id,ws.id workout_session_id,ws.completed_at,
        es.exercise_session_id,es.comparison_exercise_session_id,
        coalesce(es.scoring_weight,1)::numeric raw_weight,
        cur.exercise_name_snapshot
      from public.workout_sessions ws
      join public.exercise_scores es on es.workout_session_id=ws.id
      join public.exercise_sessions cur on cur.id=es.exercise_session_id
      where ws.status='completed' and coalesce(ws.is_test,false)=false
        and ws.completed_at>=v_period.period_start and ws.completed_at<v_period.period_end
        and es.comparison_exercise_session_id is not null
        and es.result::text<>'baseline'
    ), cur_sets as (
      select e.*,s.id set_id,row_number() over(partition by e.exercise_session_id order by s.set_number,s.id) rn,
        coalesce(s.weight,0)::numeric weight,
        (coalesce(s.reps,0)+coalesce(s.partial_reps,0)*0.5)::numeric reps_eff
      from eligible_exercises e join public.sets s on s.exercise_session_id=e.exercise_session_id
      where s.set_type::text<>'warmup' and coalesce(s.reps,0)>0
    ), prev_sets as (
      select e.exercise_session_id,s.id set_id,row_number() over(partition by e.exercise_session_id order by s.set_number,s.id) rn,
        coalesce(s.weight,0)::numeric weight,
        (coalesce(s.reps,0)+coalesce(s.partial_reps,0)*0.5)::numeric reps_eff
      from eligible_exercises e join public.sets s on s.exercise_session_id=e.comparison_exercise_session_id
      where s.set_type::text<>'warmup' and coalesce(s.reps,0)>0
    ), matched as (
      select c.athlete_user_id,c.workout_session_id,c.completed_at,c.exercise_session_id,c.exercise_name_snapshot,c.raw_weight,c.rn,
        case
          when p.weight>0 and c.weight>0 and p.reps_eff>0 then ((c.weight*c.reps_eff)/(p.weight*p.reps_eff)-1)*100
          when p.weight=0 and c.weight=0 and p.reps_eff>0 then (c.reps_eff/p.reps_eff-1)*100
          else null
        end raw_pct
      from cur_sets c join prev_sets p on p.exercise_session_id=c.exercise_session_id and p.rn=c.rn
    ), counts as (
      select e.exercise_session_id,
        (select count(*) from public.sets s where s.exercise_session_id=e.exercise_session_id and s.set_type::text<>'warmup' and coalesce(s.reps,0)>0) cur_count,
        (select count(*) from public.sets s where s.exercise_session_id=e.comparison_exercise_session_id and s.set_type::text<>'warmup' and coalesce(s.reps,0)>0) prev_count,
        (select count(*) from public.sets s where s.exercise_session_id=e.exercise_session_id and s.set_type::text<>'warmup' and coalesce(s.reps,0)>=3 and s.set_number>(select coalesce(max(ps.set_number),0) from public.sets ps where ps.exercise_session_id=e.comparison_exercise_session_id and ps.set_type::text<>'warmup')) extra_qualifying
      from eligible_exercises e
    ), exercise_results as (
      select m.athlete_user_id,m.workout_session_id,min(m.completed_at) completed_at,m.exercise_session_id,min(m.exercise_name_snapshot) exercise_name_snapshot,min(m.raw_weight) raw_weight,
        avg(greatest(-25::numeric,least(25::numeric,m.raw_pct)))
          + least(3::numeric,coalesce(max(c.extra_qualifying),0)::numeric)
          - least(3::numeric,greatest(0,coalesce(max(c.prev_count),0)-coalesce(max(c.cur_count),0))::numeric) exercise_pct
      from matched m join counts c on c.exercise_session_id=m.exercise_session_id
      where m.raw_pct is not null
      group by m.athlete_user_id,m.workout_session_id,m.exercise_session_id
    ), weighted as (
      select *,case when count(*) over(partition by workout_session_id)>=3 then least(raw_weight,0.35*sum(raw_weight) over(partition by workout_session_id)) else raw_weight end adj_weight
      from exercise_results
    ), workout_results as (
      select athlete_user_id,workout_session_id,min(completed_at) completed_at,
        greatest(-25::numeric,least(25::numeric,round(sum(exercise_pct*adj_weight)/nullif(sum(adj_weight),0),2))) beast_score,
        count(*) exercise_count
      from weighted group by athlete_user_id,workout_session_id
    ), best as (
      select distinct on (athlete_user_id) * from workout_results
      order by athlete_user_id,beast_score desc,completed_at asc,workout_session_id
    )
    insert into public.competition_entries(period_id,athlete_user_id,score,result_label,explanation,source_ref)
    select p_period_id,athlete_user_id,beast_score,
      (case when beast_score>=0 then '+' else '' end)||round(beast_score,1)::text||'% improvement',
      exercise_count::text||' like-for-like exercise comparison'||case when exercise_count=1 then '' else 's' end,
      jsonb_build_object('workout_session_id',workout_session_id,'eligible_exercises',exercise_count,'method','matched_sets_v2')
    from best;
  end if;

  with ranked as (
    select id,rank() over(order by score desc) r from public.competition_entries
    where period_id=p_period_id and is_eligible=true
  )
  update public.competition_entries e set rank=r.r,updated_at=now() from ranked r where e.id=r.id;
end
$$;

revoke all on function public.phatbot_rebuild_competition_period(uuid) from public,anon,authenticated;
