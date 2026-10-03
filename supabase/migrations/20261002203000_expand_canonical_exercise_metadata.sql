-- Expand PHATBOT's reviewed standard exercise metadata so exercise discovery can
-- filter by all meaningfully targeted muscle groups. This changes metadata only;
-- it does not rewrite workout history or canonical identity.

with reviewed(canonical_name, muscle_group, position) as (values
  ('Dumbbell Shoulder Press','triceps'::public.exercise_muscle_group,1),
  ('Chest Press Machine','triceps'::public.exercise_muscle_group,1),
  ('Chest Press Machine','shoulders'::public.exercise_muscle_group,2),
  ('Hammer Strength Plate-Loaded Iso-Lateral Decline Chest Press','triceps'::public.exercise_muscle_group,1),
  ('Hammer Strength Plate-Loaded Iso-Lateral Decline Chest Press','shoulders'::public.exercise_muscle_group,2),
  ('Leg Press','glutes'::public.exercise_muscle_group,1),
  ('Plate-Loaded Leg Press','glutes'::public.exercise_muscle_group,1),
  ('Pendulum Squat','glutes'::public.exercise_muscle_group,1),
  ('Plate-Loaded Seated Dip','chest'::public.exercise_muscle_group,1),
  ('Plate-Loaded Seated Dip','shoulders'::public.exercise_muscle_group,2),
  ('Plate-Loaded Chest-Supported Row','biceps'::public.exercise_muscle_group,1),
  ('Plate-Loaded Seated Row','biceps'::public.exercise_muscle_group,1),
  ('Wide-Grip Lat Pulldown','biceps'::public.exercise_muscle_group,1),
  ('Wide-Grip Pull-Up','biceps'::public.exercise_muscle_group,1),
  ('Good Morning','glutes'::public.exercise_muscle_group,1),
  ('Good Morning','back'::public.exercise_muscle_group,2),
  ('Deficit Push-Up','triceps'::public.exercise_muscle_group,1),
  ('Deficit Push-Up','shoulders'::public.exercise_muscle_group,2)
), resolved as (
  select e.id canonical_exercise_id, r.muscle_group, r.position
  from reviewed r
  join public.exercises e
    on e.is_standard = true
   and lower(trim(e.name)) = lower(trim(r.canonical_name))
)
insert into public.exercise_secondary_muscles(canonical_exercise_id,muscle_group,position)
select canonical_exercise_id,muscle_group,position from resolved
on conflict (canonical_exercise_id,muscle_group) do update
set position=excluded.position;
