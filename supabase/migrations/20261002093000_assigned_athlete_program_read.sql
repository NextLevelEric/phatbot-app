-- Athletes must be able to read the prescribed structure of the program
-- version currently assigned to them. Coach-owned private programs remain
-- private to everyone else.

create policy "training_program_days_read_assigned_athlete"
on public.training_program_days
for select
to authenticated
using (
  exists (
    select 1
    from public.athlete_program_enrollments assignment
    where assignment.athlete_user_id = (select auth.uid())
      and assignment.program_id = training_program_days.program_id
      and assignment.status in ('active', 'scheduled')
  )
);

create policy "training_program_exercises_read_assigned_athlete"
on public.training_program_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.training_program_days assigned_day
    join public.athlete_program_enrollments assignment
      on assignment.program_id = assigned_day.program_id
    where assigned_day.id = training_program_exercises.program_day_id
      and assignment.athlete_user_id = (select auth.uid())
      and assignment.status in ('active', 'scheduled')
  )
);
