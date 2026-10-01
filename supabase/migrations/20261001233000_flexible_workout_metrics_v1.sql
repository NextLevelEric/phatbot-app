-- Flexible workout metrics V1
-- Adds explicit template/session targets for timed rounds and distance work,
-- plus optional distance on logged timed sets. Existing rep-based workouts are unchanged.

alter table public.workout_exercises
  add column if not exists target_rounds integer,
  add column if not exists target_duration_seconds_min integer,
  add column if not exists target_duration_seconds_max integer,
  add column if not exists target_distance numeric(10,2),
  add column if not exists target_distance_unit text;

alter table public.workout_exercises
  add constraint workout_exercises_target_rounds_check
    check (target_rounds is null or target_rounds > 0),
  add constraint workout_exercises_target_duration_min_check
    check (target_duration_seconds_min is null or target_duration_seconds_min > 0),
  add constraint workout_exercises_target_duration_max_check
    check (target_duration_seconds_max is null or target_duration_seconds_max > 0),
  add constraint workout_exercises_target_duration_range_check
    check (target_duration_seconds_min is null or target_duration_seconds_max is null or target_duration_seconds_min <= target_duration_seconds_max),
  add constraint workout_exercises_target_distance_check
    check (target_distance is null or target_distance > 0),
  add constraint workout_exercises_target_distance_unit_check
    check (target_distance_unit is null or target_distance_unit in ('yd','mi','m','km'));

alter table public.exercise_sessions
  add column if not exists target_rounds_snapshot integer,
  add column if not exists target_duration_seconds_min_snapshot integer,
  add column if not exists target_duration_seconds_max_snapshot integer,
  add column if not exists target_distance_snapshot numeric(10,2),
  add column if not exists target_distance_unit_snapshot text;

alter table public.sets
  add column if not exists distance numeric(10,2),
  add column if not exists distance_unit text;

alter table public.sets
  add constraint sets_distance_check check (distance is null or distance > 0),
  add constraint sets_distance_unit_check check (distance_unit is null or distance_unit in ('yd','mi','m','km')),
  add constraint sets_distance_pair_check check ((distance is null) = (distance_unit is null));

comment on column public.workout_exercises.target_rounds is 'Optional planned number of rounds/efforts for non-rep training.';
comment on column public.workout_exercises.target_duration_seconds_min is 'Optional minimum target duration per effort in seconds.';
comment on column public.workout_exercises.target_duration_seconds_max is 'Optional maximum target duration per effort in seconds.';
comment on column public.workout_exercises.target_distance is 'Optional planned distance per effort.';
comment on column public.workout_exercises.target_distance_unit is 'Unit for target_distance: yd, mi, m, or km.';
comment on column public.sets.distance is 'Optional completed distance for a timed effort; does not enter lifting PO/PR/Beast scoring.';
comment on column public.sets.distance_unit is 'Unit for completed distance: yd, mi, m, or km.';
