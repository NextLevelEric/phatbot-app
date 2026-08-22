-- Coaches may program workout templates for actively linked athletes.
-- Completed workout history remains athlete-owned and read-only to coaches.

create policy workouts_insert_linked_coach on public.workouts
for insert with check (
  exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = auth.uid()
      and ca.athlete_user_id = workouts.athlete_user_id
      and ca.active = true
  )
);

create policy workouts_update_linked_coach on public.workouts
for update using (
  exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = auth.uid()
      and ca.athlete_user_id = workouts.athlete_user_id
      and ca.active = true
  )
) with check (
  exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = auth.uid()
      and ca.athlete_user_id = workouts.athlete_user_id
      and ca.active = true
  )
);

create policy workouts_delete_linked_coach on public.workouts
for delete using (
  exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = auth.uid()
      and ca.athlete_user_id = workouts.athlete_user_id
      and ca.active = true
  )
);

create policy workout_exercises_insert_linked_coach on public.workout_exercises
for insert with check (
  exists (
    select 1
    from public.workouts w
    join public.coach_athletes ca on ca.athlete_user_id = w.athlete_user_id
    where w.id = workout_exercises.workout_id
      and ca.coach_user_id = auth.uid()
      and ca.active = true
  )
);

create policy workout_exercises_update_linked_coach on public.workout_exercises
for update using (
  exists (
    select 1
    from public.workouts w
    join public.coach_athletes ca on ca.athlete_user_id = w.athlete_user_id
    where w.id = workout_exercises.workout_id
      and ca.coach_user_id = auth.uid()
      and ca.active = true
  )
) with check (
  exists (
    select 1
    from public.workouts w
    join public.coach_athletes ca on ca.athlete_user_id = w.athlete_user_id
    where w.id = workout_exercises.workout_id
      and ca.coach_user_id = auth.uid()
      and ca.active = true
  )
);

create policy workout_exercises_delete_linked_coach on public.workout_exercises
for delete using (
  exists (
    select 1
    from public.workouts w
    join public.coach_athletes ca on ca.athlete_user_id = w.athlete_user_id
    where w.id = workout_exercises.workout_id
      and ca.coach_user_id = auth.uid()
      and ca.active = true
  )
);
