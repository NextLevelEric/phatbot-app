-- Athletes must be able to read custom exercises assigned by a coach
-- when those exercises are used in one of the athlete's workout templates.

create policy exercises_read_assigned_to_athlete on public.exercises
for select using (
  exists (
    select 1
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.exercise_id = exercises.id
      and w.athlete_user_id = auth.uid()
      and w.is_active = true
  )
);
