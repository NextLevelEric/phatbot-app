-- Manual rollback for 20260911180023_fix_beast_skipped_exercise_scoring.sql.
-- Keep outside supabase/migrations: apply only if controlled production verification fails.
-- Restores the immediately preceding production function definitions and privileges.

-- Cardio Bunny V4: score standardized benchmark segments instead of whole-workout distance matching.
-- Run/walk/bike/etc. remain isolated by activity_type; 1-mile/5K/10K segments compare only to the same segment key.

create or replace function public.phatbot_rebuild_competition_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    with current_segments as (
      select seg.id segment_id, seg.athlete_user_id, seg.cardio_activity_id,
        seg.segment_key, seg.segment_label, seg.distance_meters, seg.duration_seconds,
        a.activity_type, a.activity_name, a.started_at
      from public.cardio_activity_segments seg
      join public.cardio_activities a on a.id=seg.cardio_activity_id
      where a.started_at>=v_period.period_start and a.started_at<v_period.period_end
        and seg.duration_seconds>0 and seg.distance_meters>0
    ), candidates as (
      select c.*,
        prev.segment_id prior_segment_id,
        prev.duration_seconds prior_duration,
        prev.started_at prior_started_at
      from current_segments c
      left join lateral (
        select pseg.id segment_id,pseg.duration_seconds,pa.started_at
        from public.cardio_activity_segments pseg
        join public.cardio_activities pa on pa.id=pseg.cardio_activity_id
        where pseg.athlete_user_id=c.athlete_user_id
          and pseg.segment_key=c.segment_key
          and pa.activity_type=c.activity_type
          and pa.started_at<c.started_at
          and pseg.duration_seconds>0
        order by pa.started_at desc,pseg.created_at desc
        limit 1
      ) prev on true
    ), scored as (
      select *,
        least(50::numeric,greatest(-100::numeric,
          ((prior_duration/nullif(duration_seconds,0))-1)*100)) improvement
      from candidates
      where prior_duration is not null
    ), best as (
      select distinct on (athlete_user_id) *
      from scored
      order by athlete_user_id,improvement desc,started_at asc,segment_id
    )
    insert into public.competition_entries(period_id,athlete_user_id,score,result_label,explanation,source_ref)
    select p_period_id,athlete_user_id,round(improvement,2),
      (case when improvement>=0 then '+' else '' end)||round(improvement,1)::text||'% '||segment_label,
      segment_label||' progression versus the previous '||segment_label||' from the same cardio activity type',
      jsonb_build_object(
        'cardio_activity_id',cardio_activity_id,
        'segment_id',segment_id,
        'prior_segment_id',prior_segment_id,
        'segment_key',segment_key,
        'segment_label',segment_label,
        'activity_type',activity_type,
        'current_seconds',duration_seconds,
        'prior_seconds',prior_duration,
        'method','standardized_segment_progression_v4'
      )
    from best;

  elsif v_period.competition='beast' then
    with current_sessions as (
      select ws.id,ws.athlete_user_id,ws.workout_id,ws.completed_at,
        prev.id previous_session_id
      from public.workout_sessions ws
      left join lateral (
        select p.id
        from public.workout_sessions p
        where p.athlete_user_id=ws.athlete_user_id
          and p.workout_id=ws.workout_id
          and p.status='completed'
          and coalesce(p.is_test,false)=false
          and p.completed_at<ws.completed_at
        order by p.completed_at desc
        limit 1
      ) prev on true
      where ws.status='completed' and coalesce(ws.is_test,false)=false
        and ws.completed_at>=v_period.period_start and ws.completed_at<v_period.period_end
        and prev.id is not null
    ), exercise_totals as (
      select cs.id workout_session_id,cs.athlete_user_id,cs.completed_at,
        cur.exercise_id,
        coalesce(sum(case when s.set_type::text not in ('warmup','timed') and coalesce(s.reps,0)>0 and coalesce(s.weight,0)>=0 then coalesce(s.weight,0)*s.reps else 0 end),0)::numeric current_total,
        coalesce((select sum(case when ps.set_type::text not in ('warmup','timed') and coalesce(ps.reps,0)>0 and coalesce(ps.weight,0)>=0 then coalesce(ps.weight,0)*ps.reps else 0 end)
          from public.exercise_sessions prev_ex
          join public.sets ps on ps.exercise_session_id=prev_ex.id
          where prev_ex.workout_session_id=cs.previous_session_id and prev_ex.exercise_id=cur.exercise_id),0)::numeric previous_total
      from current_sessions cs
      join public.exercise_sessions cur on cur.workout_session_id=cs.id
      left join public.sets s on s.exercise_session_id=cur.id
      group by cs.id,cs.athlete_user_id,cs.completed_at,cs.previous_session_id,cur.exercise_id
    ), workout_results as (
      select athlete_user_id,workout_session_id,min(completed_at) completed_at,
        sum(greatest(current_total,0)) current_lift_total,
        sum(previous_total) previous_lift_total,
        count(*) filter(where previous_total>0) comparable_exercise_count
      from exercise_totals
      where previous_total>0
      group by athlete_user_id,workout_session_id
    ), scored as (
      select *,round(((current_lift_total-previous_lift_total)/nullif(previous_lift_total,0))*100,2) beast_score
      from workout_results
      where previous_lift_total>0 and comparable_exercise_count>0
    ), best as (
      select distinct on (athlete_user_id) *
      from scored
      order by athlete_user_id,beast_score desc,completed_at asc,workout_session_id
    )
    insert into public.competition_entries(period_id,athlete_user_id,score,result_label,explanation,source_ref)
    select p_period_id,athlete_user_id,beast_score,
      (case when beast_score>=0 then '+' else '' end)||round(beast_score,1)::text||'% volume',
      comparable_exercise_count::text||' comparable exercise'||case when comparable_exercise_count=1 then '' else 's' end||' vs previous completion of the same workout',
      jsonb_build_object('workout_session_id',workout_session_id,'current_lift_total',current_lift_total,'previous_lift_total',previous_lift_total,'comparable_exercises',comparable_exercise_count,'method','workout_report_volume_v3')
    from best;
  end if;

  with ranked as (
    select id,rank() over(order by score desc) r
    from public.competition_entries
    where period_id=p_period_id and is_eligible=true
  )
  update public.competition_entries e set rank=r.r,updated_at=now() from ranked r where e.id=r.id;
end
$function$;

grant execute on function public.phatbot_rebuild_competition_period(uuid) to service_role;

-- Train Together room-only Beast standings.
-- Uses the locked Beast V3 volume-vs-prior-comparable logic without writing to official competition_entries.
create or replace function public.get_live_workout_room_beast(p_room_id uuid)
returns table (athlete_user_id uuid,athlete_name text,workout_session_id uuid,session_status text,score numeric,result_label text,comparable_exercises integer,rank bigint)
language sql stable security definer set search_path=public as $$
with allowed as (
 select r.id from public.live_workout_rooms r where r.id=p_room_id and (r.host_user_id=auth.uid() or public.is_live_workout_room_member(r.id))
), members as (
 select m.athlete_user_id,m.workout_session_id,ws.status::text session_status,ws.completed_at,coalesce(nullif(trim(p.display_name),''),'PHATBOT Athlete') athlete_name
 from public.live_workout_room_members m join allowed a on a.id=m.room_id left join public.workout_sessions ws on ws.id=m.workout_session_id left join public.profiles p on p.id=m.athlete_user_id
), current_ex as (
 select mb.athlete_user_id,mb.athlete_name,mb.workout_session_id,mb.session_status,mb.completed_at,cur.exercise_id,
 coalesce(sum(case when s.set_type::text not in ('warmup','timed') and coalesce(s.reps,0)>0 and coalesce(s.weight,0)>=0 then coalesce(s.weight,0)*s.reps else 0 end),0)::numeric current_total
 from members mb join public.exercise_sessions cur on cur.workout_session_id=mb.workout_session_id left join public.sets s on s.exercise_session_id=cur.id
 group by mb.athlete_user_id,mb.athlete_name,mb.workout_session_id,mb.session_status,mb.completed_at,cur.exercise_id
), comparable as (
 select c.*,coalesce(prev.previous_total,0)::numeric previous_total
 from current_ex c left join lateral (
   select sum(case when ps.set_type::text not in ('warmup','timed') and coalesce(ps.reps,0)>0 and coalesce(ps.weight,0)>=0 then coalesce(ps.weight,0)*ps.reps else 0 end)::numeric previous_total
   from public.workout_sessions pws join public.exercise_sessions pex on pex.workout_session_id=pws.id and pex.exercise_id=c.exercise_id join public.sets ps on ps.exercise_session_id=pex.id
   where pws.athlete_user_id=c.athlete_user_id and pws.status='completed' and coalesce(pws.is_test,false)=false and pws.id<>c.workout_session_id and pws.completed_at<coalesce(c.completed_at,now())
   group by pws.id,pws.completed_at order by pws.completed_at desc limit 1
 ) prev on true
), totals as (
 select athlete_user_id,athlete_name,workout_session_id,session_status,
 sum(greatest(current_total,0)) filter(where previous_total>0) current_lift_total,sum(previous_total) filter(where previous_total>0) previous_lift_total,count(*) filter(where previous_total>0)::integer comparable_exercises
 from comparable group by athlete_user_id,athlete_name,workout_session_id,session_status
), scored as (
 select *,case when previous_lift_total>0 and comparable_exercises>0 then round(((current_lift_total-previous_lift_total)/previous_lift_total)*100,2) end score from totals
), ranked as (
 select *,case when score is not null then rank() over(order by score desc nulls last) end rank from scored
)
select athlete_user_id,athlete_name,workout_session_id,session_status,score,
 case when score is null then 'Establishing baseline' else (case when score>=0 then '+' else '' end)||round(score,1)::text||'% volume' end result_label,
 comparable_exercises,rank from ranked order by score desc nulls last,athlete_name;
$$;
revoke all on function public.get_live_workout_room_beast(uuid) from public,anon,authenticated;
grant execute on function public.get_live_workout_room_beast(uuid) to authenticated,service_role;
