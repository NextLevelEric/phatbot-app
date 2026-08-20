-- Preserve coach-prescribed set targets exactly as written in workout templates.
-- This complements numeric target_rep_min/target_rep_max, which are still useful
-- for manually built workouts but cannot represent AMRAP, 15+, timed work, or
-- different targets across individual sets.

alter table public.workout_exercises
  add column if not exists prescribed_set_targets text[] not null default '{}';

alter table public.exercise_sessions
  add column if not exists prescribed_set_targets_snapshot text[] not null default '{}';

comment on column public.workout_exercises.prescribed_set_targets is
  'Ordered coach-prescribed target text for each planned set, e.g. {"8-10","8-10","AMRAP"}.';

comment on column public.exercise_sessions.prescribed_set_targets_snapshot is
  'Immutable snapshot of prescribed set target text when the workout session begins.';
