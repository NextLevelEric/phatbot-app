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
revoke all on function public.get_live_workout_room_beast(uuid) from public,anon;
grant execute on function public.get_live_workout_room_beast(uuid) to authenticated;
