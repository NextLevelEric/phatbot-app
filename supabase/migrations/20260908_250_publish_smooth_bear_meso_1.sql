-- Publish the exact six-day workbook supplied for Eric's current mesocycle.
with coach as (select user_id from public.coach_profiles where dashboard_enabled=true order by created_at limit 1)
insert into public.training_programs(coach_user_id,name,slug,description,status,version,published_at)
select user_id,'The Smooth Bear''s Current Program','smooth-bear-current-meso-1','Train alongside Eric Parent on the current six-day Smooth Bear mesocycle. Progressive overload, independently tracked for every athlete.','published',1,now() from coach
on conflict(slug) do update set name=excluded.name,description=excluded.description,status='published',published_at=coalesce(public.training_programs.published_at,now()),updated_at=now();

with p as (select id from public.training_programs where slug='smooth-bear-current-meso-1')
insert into public.training_program_days(program_id,day_number,name)
select p.id,v.n,v.name from p cross join (values (1,'Day 1 (Push)'),(2,'Day 2 (Pull)'),(3,'Day 3 (Hams)'),(4,'Day 4 (PushPull)'),(5,'Day 5 (Quads)'),(6,'Day 6 (Arms)')) v(n,name)
on conflict(program_id,day_number) do update set name=excluded.name;

with plan(day_number,position,exercise_name,targets) as (values
(1,1,'Flat barbell bench press',array['3','8','12','12']::text[]),(1,2,'Guilotine Smith Press',array['8','8','12','12']::text[]),(1,3,'Upright Row',array['12','12','15','15']::text[]),(1,4,'Tricep Cable katanas',array['15','15','15','15']::text[]),(1,5,'Deficit pushups',array['AMRAP','AMRAP','AMRAP']::text[]),
(2,1,'Neutral Grip Pull Down',array['3','8','12','12']::text[]),(2,2,'Bent Over Barbell Row',array['8','8','12','12']::text[]),(2,3,'Chest Supported Dumbell Row',array['12','12','15','15']::text[]),(2,4,'Cable Preacher Curls',array['15','15','15','15']::text[]),(2,5,'Pull Ups',array['AMRAP','AMRAP']::text[]),(2,6,'Dead Hang',array['2 Minutes (Non consecutive)']::text[]),
(3,1,'Traditional Deadlift',array['3','8','12','12']::text[]),(3,2,'Pendulum Squat',array['8','8','12','12']::text[]),(3,3,'Leg Curls',array['12','12','15','15+']::text[]),(3,4,'Back Extension',array['15','15','15','15']::text[]),(3,5,'Hanging Leg Lift',array['AMRAP','AMRAP','AMRAP']::text[]),
(4,1,'Incline Dumbbell Bench Press',array['3','8','12','12']::text[]),(4,2,'Wide Grip Pull Ups',array['8','8','12','12']::text[]),(4,3,'Dumbbell Lateral Raise',array[]::text[]),(4,4,'Chest Fly',array['12','12','15','15']::text[]),(4,5,'Dumbbell Preacher Curls',array['15','15','15','15']::text[]),(4,6,'Weighted Sit Ups',array['15','15','15']::text[]),
(5,1,'Plated Leg Press',array['3','8','12','12']::text[]),(5,2,'RDLS',array['8','8','12','12']::text[]),(5,3,'Good Mornings',array['12','12','15','15+']::text[]),(5,4,'Leg extension',array['15','15','15','15+']::text[]),(5,5,'Dead Hang',array['2 Minutes (Non consecutive)']::text[]),
(6,1,'dips',array['3','8','12','12+']::text[]),(6,2,'Lateral Raise',array['12','12','12','12','12+']::text[]),(6,3,'Cable Preacher Curls',array['12','15','12','15','15+']::text[]),(6,4,'Cable Tricep Extension',array['15','15','15','15','15+']::text[])
), chosen as (
 select plan.*,(select e.id from public.exercises e where e.normalized_name=lower(trim(plan.exercise_name)) order by case when e.created_by=(select coach_user_id from public.training_programs where slug='smooth-bear-current-meso-1') then 0 else 1 end,e.created_at limit 1) exercise_id from plan
), resolved as (
 select d.id day_id,c.position,c.exercise_id,c.targets from chosen c join public.training_programs p on p.slug='smooth-bear-current-meso-1' join public.training_program_days d on d.program_id=p.id and d.day_number=c.day_number
)
insert into public.training_program_exercises(program_day_id,exercise_id,position,prescribed_set_targets)
select day_id,exercise_id,position,targets from resolved where exercise_id is not null
on conflict(program_day_id,position) do update set exercise_id=excluded.exercise_id,prescribed_set_targets=excluded.prescribed_set_targets;

create or replace function public.enroll_in_current_eric_program() returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_program uuid; v_enrollment uuid; d record; v_workout uuid;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select id into v_program from training_programs where status='published' and coach_user_id=(select user_id from coach_profiles where dashboard_enabled=true order by created_at limit 1) order by published_at desc limit 1;
 if v_program is null then raise exception 'No published Eric program'; end if;
 insert into athlete_program_enrollments(athlete_user_id,program_id) values(v_user,v_program) on conflict(athlete_user_id,program_id) do update set status='active',ended_at=null returning id into v_enrollment;
 for d in select * from training_program_days where program_id=v_program order by day_number loop
  select workout_id into v_workout from athlete_program_workouts where enrollment_id=v_enrollment and program_day_id=d.id;
  if v_workout is null then
   insert into workouts(athlete_user_id,name,description,is_active,sort_order) values(v_user,d.name,'Train with Eric · The Smooth Bear''s Current Program',true,d.day_number) returning id into v_workout;
   insert into workout_exercises(workout_id,exercise_id,position,prescribed_set_targets) select v_workout,exercise_id,position,prescribed_set_targets from training_program_exercises where program_day_id=d.id order by position;
   insert into athlete_program_workouts(enrollment_id,program_day_id,workout_id) values(v_enrollment,d.id,v_workout);
  end if;
 end loop;
 return v_enrollment;
end $$;
grant execute on function public.enroll_in_current_eric_program() to authenticated;

create or replace function public.get_current_eric_program() returns table(program_id uuid,name text,description text,version integer,day_count bigint,enrolled boolean) language sql stable security definer set search_path=public as $$
 select p.id,p.name,p.description,p.version,count(d.id),exists(select 1 from athlete_program_enrollments a where a.program_id=p.id and a.athlete_user_id=auth.uid() and a.status='active')
 from training_programs p left join training_program_days d on d.program_id=p.id
 where p.status='published' and p.coach_user_id=(select user_id from coach_profiles where dashboard_enabled=true order by created_at limit 1)
 group by p.id order by p.published_at desc limit 1
$$;
grant execute on function public.get_current_eric_program() to authenticated;
