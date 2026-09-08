create or replace function public.enroll_athlete_in_current_eric_program(p_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_program uuid; v_enrollment uuid; d record; v_workout uuid;
begin
 select id into v_program from training_programs where status='published' and coach_user_id=(select user_id from coach_profiles where dashboard_enabled=true order by created_at limit 1) order by published_at desc limit 1;
 if v_program is null then return null; end if;
 insert into athlete_program_enrollments(athlete_user_id,program_id) values(p_user,v_program) on conflict(athlete_user_id,program_id) do update set status='active',ended_at=null returning id into v_enrollment;
 for d in select * from training_program_days where program_id=v_program order by day_number loop
  select workout_id into v_workout from athlete_program_workouts where enrollment_id=v_enrollment and program_day_id=d.id;
  if v_workout is null then
   insert into workouts(athlete_user_id,name,description,is_active,sort_order) values(p_user,d.name,'Train with Eric · The Smooth Bear''s Current Program',true,d.day_number) returning id into v_workout;
   insert into workout_exercises(workout_id,exercise_id,position,prescribed_set_targets) select v_workout,exercise_id,position,prescribed_set_targets from training_program_exercises where program_day_id=d.id order by position;
   insert into athlete_program_workouts(enrollment_id,program_day_id,workout_id) values(v_enrollment,d.id,v_workout);
  end if;
 end loop;
 return v_enrollment;
end $$;

create or replace function public.enroll_in_current_eric_program() returns uuid language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 return public.enroll_athlete_in_current_eric_program(auth.uid());
end $$;
grant execute on function public.enroll_in_current_eric_program() to authenticated;
revoke all on function public.enroll_athlete_in_current_eric_program(uuid) from public,anon,authenticated;

create or replace function public.default_new_athlete_to_eric_program() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.enroll_athlete_in_current_eric_program(new.user_id);
 return new;
end $$;
drop trigger if exists default_new_athlete_eric_program on public.athlete_profiles;
create trigger default_new_athlete_eric_program after insert on public.athlete_profiles for each row execute function public.default_new_athlete_to_eric_program();
