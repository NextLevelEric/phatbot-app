-- Seed the first reviewed PHATBOT stock-program catalog from Eric's four source
-- workbooks. This migration creates new canonical library entries and immutable
-- published program versions without assigning any athlete or rewriting workout
-- history. It is deliberately idempotent: matching rows are accepted, while any
-- conflicting published v1 or reviewed identity causes the transaction to fail.

create temp table _stock_catalog_canonical_exercises (
  name text primary key,
  muscle_group text not null,
  equipment text not null,
  primary_muscle_group public.exercise_muscle_group not null,
  movement_pattern public.exercise_movement_pattern not null,
  equipment_category public.exercise_equipment_category not null,
  exercise_class public.exercise_classification not null,
  laterality public.exercise_laterality not null,
  setup public.exercise_setup not null
) on commit drop;

insert into _stock_catalog_canonical_exercises values
  ('Assisted Dip','Triceps','Machine','triceps','vertical_push','machine','compound','bilateral','other'),
  ('Back Extension','Back','Bodyweight','back','hinge','bodyweight','compound','bilateral','other'),
  ('Barbell Skull Crusher','Triceps','Barbell','triceps','isolation','barbell','isolation','bilateral','flat'),
  ('Bayesian Cable Curl','Biceps','Cable','biceps','isolation','cable','isolation','unilateral','standing'),
  ('Bodyweight Lunge','Quads','Bodyweight','quads','lunge','bodyweight','compound','unilateral','standing'),
  ('Bulgarian Split Squat','Quads','Other','quads','lunge','other','compound','unilateral','standing'),
  ('Cable Flexion Row','Back','Cable','back','horizontal_pull','cable','compound','bilateral','seated'),
  ('Cable Lat Prayer','Back','Cable','back','vertical_pull','cable','isolation','bilateral','standing'),
  ('Cable Preacher Curl','Biceps','Cable','biceps','isolation','cable','isolation','bilateral','seated'),
  ('Cable Triceps Extension','Triceps','Cable','triceps','isolation','cable','isolation','bilateral','standing'),
  ('Chest Fly','Chest','Other','chest','isolation','other','isolation','bilateral','other'),
  ('Plate-Loaded Chest-Supported Row','Back','Machine','back','horizontal_pull','machine','compound','bilateral','chest_supported'),
  ('Dead Hang','Back','Bodyweight','back','other','bodyweight','compound','bilateral','other'),
  ('Deficit Push-Up','Chest','Bodyweight','chest','horizontal_push','bodyweight','compound','bilateral','other'),
  ('Dip','Triceps','Bodyweight','triceps','vertical_push','bodyweight','compound','bilateral','other'),
  ('Dumbbell Lateral Raise','Shoulders','Dumbbell','shoulders','isolation','dumbbell','isolation','bilateral','standing'),
  ('Dumbbell Preacher Curl','Biceps','Dumbbell','biceps','isolation','dumbbell','isolation','unilateral','seated'),
  ('Good Morning','Hamstrings','Barbell','hamstrings','hinge','barbell','compound','bilateral','standing'),
  ('Guillotine Smith Press','Chest','Smith Machine','chest','horizontal_push','smith_machine','compound','bilateral','flat'),
  ('Hammer Strength Lateral Raise','Shoulders','Machine','shoulders','isolation','machine','isolation','bilateral','seated'),
  ('Hammer Strength Plate-Loaded Iso-Lateral Decline Chest Press','Chest','Machine','chest','horizontal_push','machine','compound','unilateral','decline'),
  ('Hanging Leg Raise','Core','Bodyweight','core','core','bodyweight','compound','bilateral','other'),
  ('Heel-Elevated Barbell Squat','Quads','Barbell','quads','squat','barbell','compound','bilateral','standing'),
  ('Hip Abductor Machine','Abductors','Machine','abductors','isolation','machine','isolation','bilateral','seated'),
  ('Hip Adductor Machine','Adductors','Machine','adductors','isolation','machine','isolation','bilateral','seated'),
  ('Incline Dumbbell Lateral Raise','Shoulders','Dumbbell','shoulders','isolation','dumbbell','isolation','bilateral','incline'),
  ('Iso-Lateral Leg Extension','Quads','Machine','quads','isolation','machine','isolation','unilateral','seated'),
  ('Lateral Raise','Shoulders','Other','shoulders','isolation','other','isolation','bilateral','other'),
  ('Leg Curl','Hamstrings','Other','hamstrings','isolation','other','isolation','bilateral','other'),
  ('Leg Extension','Quads','Machine','quads','isolation','machine','isolation','bilateral','seated'),
  ('Machine Chest Fly','Chest','Machine','chest','isolation','machine','isolation','bilateral','seated'),
  ('Pendulum Squat','Quads','Machine','quads','squat','machine','compound','bilateral','standing'),
  ('Plate-Loaded Seated Dip','Triceps','Machine','triceps','vertical_push','machine','compound','bilateral','seated'),
  ('Plate-Loaded Seated Row','Back','Machine','back','horizontal_pull','machine','compound','bilateral','seated'),
  ('Plate-Loaded Chest Fly','Chest','Machine','chest','isolation','machine','isolation','bilateral','seated'),
  ('Plate-Loaded Leg Press','Quads','Machine','quads','squat','machine','compound','bilateral','seated'),
  ('Pull-Up','Back','Bodyweight','back','vertical_pull','bodyweight','compound','bilateral','other'),
  ('Seated Dumbbell Lateral Raise','Shoulders','Dumbbell','shoulders','isolation','dumbbell','isolation','bilateral','seated'),
  ('Seated Incline Dumbbell Curl','Biceps','Dumbbell','biceps','isolation','dumbbell','isolation','bilateral','incline'),
  ('Seated Leg Curl','Hamstrings','Machine','hamstrings','isolation','machine','isolation','bilateral','seated'),
  ('Sissy Squat','Quads','Bodyweight','quads','squat','bodyweight','isolation','bilateral','standing'),
  ('Triceps Katana Extension','Triceps','Cable','triceps','isolation','cable','isolation','bilateral','standing'),
  ('Upright Barbell Row','Shoulders','Barbell','shoulders','vertical_pull','barbell','compound','bilateral','standing'),
  ('Upright Row','Shoulders','Other','shoulders','vertical_pull','other','compound','bilateral','standing'),
  ('Weighted Sit-Up','Core','Other','core','core','other','isolation','bilateral','other'),
  ('Wide-Grip Lat Pulldown','Back','Cable','back','vertical_pull','cable','compound','bilateral','seated'),
  ('Wide-Grip Pull-Up','Back','Bodyweight','back','vertical_pull','bodyweight','compound','bilateral','other');

insert into public.exercises (
  name, muscle_group, equipment, is_active, created_by, is_standard, is_custom,
  primary_muscle_group, movement_pattern, equipment_category, exercise_class, laterality, setup
)
select
  expected.name, expected.muscle_group, expected.equipment, true, null, true, false,
  expected.primary_muscle_group, expected.movement_pattern, expected.equipment_category,
  expected.exercise_class, expected.laterality, expected.setup
from _stock_catalog_canonical_exercises expected
where not exists (
  select 1 from public.exercises existing
  where existing.is_standard = true
    and existing.normalized_name = lower(trim(expected.name))
);

do $$
begin
  if exists (
    select 1
    from _stock_catalog_canonical_exercises expected
    left join public.exercises actual
      on actual.is_standard = true
     and actual.normalized_name = lower(trim(expected.name))
    where actual.id is null
       or actual.name is distinct from expected.name
       or actual.muscle_group is distinct from expected.muscle_group
       or actual.equipment is distinct from expected.equipment
       or actual.is_active is distinct from true
       or actual.created_by is not null
       or actual.is_custom is distinct from false
       or actual.canonical_exercise_id is distinct from actual.id
       or actual.primary_muscle_group is distinct from expected.primary_muscle_group
       or actual.movement_pattern is distinct from expected.movement_pattern
       or actual.equipment_category is distinct from expected.equipment_category
       or actual.exercise_class is distinct from expected.exercise_class
       or actual.laterality is distinct from expected.laterality
       or actual.setup is distinct from expected.setup
  ) then
    raise exception 'Stock catalog canonical exercise metadata conflicts with the reviewed definition';
  end if;
end
$$;

create temp table _stock_catalog_aliases (
  alias_name text primary key,
  canonical_name text not null,
  review_note text not null
) on commit drop;

insert into _stock_catalog_aliases values
  ('Barbell Squat','Barbell Back Squat','Workbook label explicitly identifies a barbell squat'),
  ('Bayesian Curl (Face-Away Cable Curl, Low to high Cable Curl)','Bayesian Cable Curl','Workbook parenthetical explicitly defines the Bayesian cable curl'),
  ('Body Weight Lunge','Bodyweight Lunge','Spacing variant'),
  ('Cable Lat Prayers','Cable Lat Prayer','Plural variant'),
  ('Cable Preacher Curls','Cable Preacher Curl','Plural variant'),
  ('Cable Tricep Extension','Cable Triceps Extension','Singular spelling variant'),
  ('Cable Tricep Extensions','Cable Triceps Extension','Plural spelling variant'),
  ('Chest Supported Plated Row','Plate-Loaded Chest-Supported Row','Workbook label explicitly identifies a plate-loaded chest-supported row'),
  ('Deficit Push Ups','Deficit Push-Up','Spacing and plural variant'),
  ('Deficit pushups','Deficit Push-Up','Spacing and plural variant'),
  ('Dips','Dip','Plural variant for unassisted bodyweight dip'),
  ('Dumbbell Incline Bench Press','Incline Dumbbell Bench Press','Word-order variant'),
  ('Dumbbell Preacher Curls','Dumbbell Preacher Curl','Plural variant'),
  ('Good Mornings','Good Morning','Plural variant'),
  ('Guilotine Smith Press','Guillotine Smith Press','Workbook spelling correction'),
  ('Hanging Leg Lift','Hanging Leg Raise','Lift/raise naming variant'),
  ('Heel Elevated Barbell Squat','Heel-Elevated Barbell Squat','Hyphenation variant'),
  ('Hip Abducter Machine','Hip Abductor Machine','Workbook spelling correction'),
  ('Hip Adducter Machine','Hip Adductor Machine','Workbook spelling correction'),
  ('ISO Dumbbell Preacher Curls','Dumbbell Preacher Curl','ISO label describes the same dumbbell preacher-curl prescription'),
  ('ISO Leg Extension','Iso-Lateral Leg Extension','Workbook abbreviation for iso-lateral machine variation'),
  ('Leg Curls','Leg Curl','Plural variant for the intentionally equipment-unspecified leg curl'),
  ('Plate Loaded Seated Dip','Plate-Loaded Seated Dip','Hyphenation variant'),
  ('Plated Chest Fly','Plate-Loaded Chest Fly','Plated label explicitly identifies the plate-loaded variation'),
  ('Plated Leg Press','Plate-Loaded Leg Press','Plated label explicitly identifies the plate-loaded variation'),
  ('Pull Ups','Pull-Up','Spacing and plural variant'),
  ('Seated Dumbbell Shoulder Press','Dumbbell Shoulder Press','Existing canonical exercise is already explicitly seated'),
  ('Seated Leg Curls','Seated Leg Curl','Plural variant'),
  ('Tricep Cable katanas','Triceps Katana Extension','Workbook spelling and word-order variant'),
  ('Weighted Sit up','Weighted Sit-Up','Hyphenation variant'),
  ('Weighted Sit Ups','Weighted Sit-Up','Hyphenation and plural variant'),
  ('Wide Grip Cable Pull Downs','Wide-Grip Lat Pulldown','Explicit wide-grip cable pulldown variant'),
  ('Wide Grip Pull Down','Wide-Grip Lat Pulldown','Spacing variant'),
  ('Wide Grip Pull Ups','Wide-Grip Pull-Up','Spacing and plural variant');

insert into public.exercise_aliases (alias_name, canonical_exercise_id, review_note)
select aliases.alias_name, canonical.id, aliases.review_note
from _stock_catalog_aliases aliases
join public.exercises canonical
  on canonical.is_standard = true
 and canonical.normalized_name = lower(trim(aliases.canonical_name))
on conflict (normalized_alias) do nothing;

do $$
begin
  if exists (
    select 1
    from _stock_catalog_aliases expected
    left join public.exercise_aliases actual
      on actual.normalized_alias = lower(trim(expected.alias_name))
    left join public.exercises canonical on canonical.id = actual.canonical_exercise_id
    where actual.id is null
       or canonical.is_standard is distinct from true
       or canonical.normalized_name is distinct from lower(trim(expected.canonical_name))
       or actual.review_note is distinct from expected.review_note
  ) then
    raise exception 'Stock catalog exercise alias conflicts with the reviewed mapping';
  end if;
end
$$;

create temp table _stock_catalog_secondary_muscles (
  canonical_name text not null,
  muscle_group public.exercise_muscle_group not null,
  position smallint not null,
  primary key (canonical_name, muscle_group),
  unique (canonical_name, position)
) on commit drop;

insert into _stock_catalog_secondary_muscles values
  ('Assisted Dip','chest',1),('Assisted Dip','shoulders',2),
  ('Back Extension','glutes',1),('Back Extension','hamstrings',2),
  ('Bodyweight Lunge','glutes',1),
  ('Bulgarian Split Squat','glutes',1),
  ('Cable Flexion Row','biceps',1),
  ('Plate-Loaded Chest-Supported Row','biceps',1),
  ('Dead Hang','shoulders',1),
  ('Deficit Push-Up','triceps',1),('Deficit Push-Up','shoulders',2),
  ('Dip','chest',1),('Dip','shoulders',2),
  ('Good Morning','glutes',1),('Good Morning','back',2),
  ('Guillotine Smith Press','triceps',1),('Guillotine Smith Press','shoulders',2),
  ('Hammer Strength Plate-Loaded Iso-Lateral Decline Chest Press','triceps',1),
  ('Hammer Strength Plate-Loaded Iso-Lateral Decline Chest Press','shoulders',2),
  ('Heel-Elevated Barbell Squat','glutes',1),
  ('Pendulum Squat','glutes',1),
  ('Plate-Loaded Seated Dip','chest',1),('Plate-Loaded Seated Dip','shoulders',2),
  ('Plate-Loaded Seated Row','biceps',1),
  ('Plate-Loaded Leg Press','glutes',1),
  ('Pull-Up','biceps',1),
  ('Upright Barbell Row','biceps',1),('Upright Barbell Row','back',2),
  ('Upright Row','biceps',1),('Upright Row','back',2),
  ('Wide-Grip Lat Pulldown','biceps',1),
  ('Wide-Grip Pull-Up','biceps',1);

insert into public.exercise_secondary_muscles (canonical_exercise_id, muscle_group, position)
select canonical.id, expected.muscle_group, expected.position
from _stock_catalog_secondary_muscles expected
join public.exercises canonical
  on canonical.is_standard = true
 and canonical.normalized_name = lower(trim(expected.canonical_name))
on conflict (canonical_exercise_id, muscle_group) do nothing;

do $$
begin
  if exists (
    (
      select expected.canonical_name, expected.muscle_group, expected.position
      from _stock_catalog_secondary_muscles expected
      except
      select canonical.name, actual.muscle_group, actual.position
      from public.exercise_secondary_muscles actual
      join public.exercises canonical on canonical.id = actual.canonical_exercise_id
      where canonical.name in (select name from _stock_catalog_canonical_exercises)
    )
    union all
    (
      select canonical.name, actual.muscle_group, actual.position
      from public.exercise_secondary_muscles actual
      join public.exercises canonical on canonical.id = actual.canonical_exercise_id
      where canonical.name in (select name from _stock_catalog_canonical_exercises)
      except
      select expected.canonical_name, expected.muscle_group, expected.position
      from _stock_catalog_secondary_muscles expected
    )
  ) then
    raise exception 'Stock catalog secondary-muscle metadata conflicts with the reviewed definition';
  end if;
end
$$;

create temp table _stock_catalog_programs (
  family_slug text primary key,
  name text not null,
  description text not null,
  day_count integer not null
) on commit drop;

insert into _stock_catalog_programs values
  ('inaugural-eager-beaver','Inaugural Eager Beaver','Legacy PHATBOT six-workout rotation.',6),
  ('first-day-in-the-gym','First Day in the Gym','Beginner four-workout gym rotation.',4),
  ('strength-as-a-skill','Strength as a Skill','Advanced six-workout strength rotation.',6),
  ('full-body','Full Body','Simple repeating full-body A/B rotation.',2);

create temp table _stock_catalog_days (
  family_slug text not null,
  day_number integer not null,
  name text not null,
  primary key (family_slug, day_number)
) on commit drop;

insert into _stock_catalog_days values
  ('inaugural-eager-beaver',1,'Day 1 (Push)'),
  ('inaugural-eager-beaver',2,'Day 2 (Pull)'),
  ('inaugural-eager-beaver',3,'Day 3 (Hams)'),
  ('inaugural-eager-beaver',4,'Day 4 (PushPull)'),
  ('inaugural-eager-beaver',5,'Day 5 (Quads)'),
  ('inaugural-eager-beaver',6,'Day 6 (Arms)'),
  ('first-day-in-the-gym',1,'Beginner A'),
  ('first-day-in-the-gym',2,'Beginner B'),
  ('first-day-in-the-gym',3,'Beginner C'),
  ('first-day-in-the-gym',4,'Beginner D'),
  ('strength-as-a-skill',1,'Day 1 (Push)'),
  ('strength-as-a-skill',2,'Day 2 (Pull)'),
  ('strength-as-a-skill',3,'Day 3 (Hams)'),
  ('strength-as-a-skill',4,'Day 4 (PushPull)'),
  ('strength-as-a-skill',5,'Day 5 (Quads)'),
  ('strength-as-a-skill',6,'Day 6 (Arms)'),
  ('full-body',1,'Full Body A'),
  ('full-body',2,'Full Body B');

create temp table _stock_catalog_prescriptions (
  family_slug text not null,
  day_number integer not null,
  position integer not null,
  canonical_name text not null,
  prescribed_set_targets text[] not null,
  notes text,
  primary key (family_slug, day_number, position)
) on commit drop;

insert into _stock_catalog_prescriptions values
  ('inaugural-eager-beaver',1,1,'Barbell Bench Press',array['3','8','12','12'],null),
  ('inaugural-eager-beaver',1,2,'Guillotine Smith Press',array['8','8','12','12'],null),
  ('inaugural-eager-beaver',1,3,'Upright Row',array['12','12','15','15'],null),
  ('inaugural-eager-beaver',1,4,'Triceps Katana Extension',array['15','15','15','15'],null),
  ('inaugural-eager-beaver',1,5,'Deficit Push-Up',array['AMRAP','AMRAP','AMRAP'],null),
  ('inaugural-eager-beaver',2,1,'Neutral-Grip Lat Pulldown',array['3','8','12','12'],null),
  ('inaugural-eager-beaver',2,2,'Bent-Over Barbell Row',array['8','8','12','12'],null),
  ('inaugural-eager-beaver',2,3,'Chest-Supported Dumbbell Row',array['12','12','15','15'],null),
  ('inaugural-eager-beaver',2,4,'Cable Preacher Curl',array['15','15','15','15'],null),
  ('inaugural-eager-beaver',2,5,'Pull-Up',array['AMRAP','AMRAP'],null),
  ('inaugural-eager-beaver',2,6,'Dead Hang',array['2 Minutes (Non consecutive)'],null),
  ('inaugural-eager-beaver',3,1,'Conventional Deadlift',array['3','8','12','12'],null),
  ('inaugural-eager-beaver',3,2,'Pendulum Squat',array['8','8','12','12'],null),
  ('inaugural-eager-beaver',3,3,'Leg Curl',array['12','12','15','15+'],null),
  ('inaugural-eager-beaver',3,4,'Back Extension',array['15','15','15','15'],null),
  ('inaugural-eager-beaver',3,5,'Hanging Leg Raise',array['AMRAP','AMRAP','AMRAP'],null),
  ('inaugural-eager-beaver',4,1,'Incline Dumbbell Bench Press',array['3','8','12','12'],null),
  ('inaugural-eager-beaver',4,2,'Wide-Grip Pull-Up',array['8','8','12','12'],null),
  ('inaugural-eager-beaver',4,3,'Dumbbell Lateral Raise',array['','','',''],null),
  ('inaugural-eager-beaver',4,4,'Chest Fly',array['12','12','15','15'],null),
  ('inaugural-eager-beaver',4,5,'Dumbbell Preacher Curl',array['15','15','15','15'],null),
  ('inaugural-eager-beaver',4,6,'Weighted Sit-Up',array['15','15','15'],null),
  ('inaugural-eager-beaver',5,1,'Plate-Loaded Leg Press',array['3','8','12','12'],null),
  ('inaugural-eager-beaver',5,2,'Romanian Deadlift',array['8','8','12','12'],null),
  ('inaugural-eager-beaver',5,3,'Good Morning',array['12','12','15','15+'],null),
  ('inaugural-eager-beaver',5,4,'Leg Extension',array['15','15','15','15+'],null),
  ('inaugural-eager-beaver',5,5,'Dead Hang',array['2 Minutes (Non consecutive)'],null),
  ('inaugural-eager-beaver',6,1,'Dip',array['3','8','12','12+'],null),
  ('inaugural-eager-beaver',6,2,'Lateral Raise',array['12','12','12','12','12+'],null),
  ('inaugural-eager-beaver',6,3,'Cable Preacher Curl',array['12','15','12','15','15+'],null),
  ('inaugural-eager-beaver',6,4,'Cable Triceps Extension',array['15','15','15','15','15+'],null),
  ('first-day-in-the-gym',1,1,'Incline Dumbbell Bench Press',array['10','10','10'],null),
  ('first-day-in-the-gym',1,2,'Barbell Back Squat',array['10','10','10'],null),
  ('first-day-in-the-gym',1,3,'Weighted Sit-Up',array['12','12','12'],null),
  ('first-day-in-the-gym',2,1,'Wide-Grip Lat Pulldown',array['10','10','10'],null),
  ('first-day-in-the-gym',2,2,'Seated Leg Curl',array['12','12','12'],null),
  ('first-day-in-the-gym',2,3,'Seated Incline Dumbbell Curl',array['12','12','12'],null),
  ('first-day-in-the-gym',3,1,'Conventional Deadlift',array['10','10','10'],null),
  ('first-day-in-the-gym',3,2,'Incline Dumbbell Bench Press',array['10','10','10'],null),
  ('first-day-in-the-gym',3,3,'Plate-Loaded Chest-Supported Row',array['10','10','10'],null),
  ('first-day-in-the-gym',4,1,'Bulgarian Split Squat',array['12','12','12'],null),
  ('first-day-in-the-gym',4,2,'Seated Dumbbell Lateral Raise',array['12','12','12'],null),
  ('first-day-in-the-gym',4,3,'Assisted Dip',array['12','12','12'],null),
  ('first-day-in-the-gym',4,4,'Machine Chest Fly',array['12','12','12'],null),
  ('strength-as-a-skill',1,1,'Barbell Bench Press',array['5','5','5','5','5'],null),
  ('strength-as-a-skill',1,2,'Incline Dumbbell Lateral Raise',array['12','12','12','12','12'],null),
  ('strength-as-a-skill',1,3,'Barbell Skull Crusher',array['15','15','15','15','15'],null),
  ('strength-as-a-skill',1,4,'Deficit Push-Up',array['15','15','15','15','15'],null),
  ('strength-as-a-skill',2,1,'Wide-Grip Lat Pulldown',array['5','5','5','5','5'],null),
  ('strength-as-a-skill',2,2,'Cable Lat Prayer',array['12','12','12','12','12'],null),
  ('strength-as-a-skill',2,3,'Cable Flexion Row',array['12','12','12','12','12'],null),
  ('strength-as-a-skill',2,4,'Seated Incline Dumbbell Curl',array['15','15','15','15','15'],null),
  ('strength-as-a-skill',3,1,'Conventional Deadlift',array['5','5','5','5','5'],null),
  ('strength-as-a-skill',3,2,'Heel-Elevated Barbell Squat',array['12','12','12','12','12'],null),
  ('strength-as-a-skill',3,3,'Hip Abductor Machine',array['15','15','15'],null),
  ('strength-as-a-skill',3,4,'Hip Adductor Machine',array['15','15','15'],null),
  ('strength-as-a-skill',3,5,'Bodyweight Lunge',array['12','12','12'],null),
  ('strength-as-a-skill',4,1,'Dumbbell Shoulder Press',array['12','12','12','12','12'],null),
  ('strength-as-a-skill',4,2,'Plate-Loaded Seated Row',array['12','12','12','12','12'],null),
  ('strength-as-a-skill',4,3,'Bayesian Cable Curl',array['12','12','12','12','12'],null),
  ('strength-as-a-skill',4,4,'Hammer Strength Lateral Raise',array['15','15','15','15','15'],null),
  ('strength-as-a-skill',5,1,'Romanian Deadlift',array['8','8','8'],null),
  ('strength-as-a-skill',5,2,'Iso-Lateral Leg Extension',array['12','12','12'],null),
  ('strength-as-a-skill',5,3,'Bulgarian Split Squat',array['12','12','12'],null),
  ('strength-as-a-skill',5,4,'Sissy Squat',array['20','20','20','20','20'],null),
  ('strength-as-a-skill',6,1,'Hammer Strength Plate-Loaded Iso-Lateral Decline Chest Press',array['5','5','5','5','5'],null),
  ('strength-as-a-skill',6,2,'Upright Barbell Row',array['12','12','12','12','12'],null),
  ('strength-as-a-skill',6,3,'Cable Triceps Extension',array['12','12','12','12','12'],null),
  ('strength-as-a-skill',6,4,'Dumbbell Preacher Curl',array['12','12','12','12','12'],null),
  ('full-body',1,1,'Barbell Bench Press',array['10','10','10'],null),
  ('full-body',1,2,'Barbell Back Squat',array['10','10','10'],null),
  ('full-body',1,3,'Wide-Grip Lat Pulldown',array['10','10','10'],null),
  ('full-body',1,4,'Seated Leg Curl',array['12','12','12'],null),
  ('full-body',1,5,'Seated Incline Dumbbell Curl',array['12','12','12'],null),
  ('full-body',1,6,'Dumbbell Shoulder Press',array['12','12','12'],null),
  ('full-body',1,7,'Weighted Sit-Up',array['12','12','12'],null),
  ('full-body',2,1,'Conventional Deadlift',array['10','10','10'],null),
  ('full-body',2,2,'Incline Dumbbell Bench Press',array['10','10','10'],null),
  ('full-body',2,3,'Plate-Loaded Chest-Supported Row',array['10','10','10'],null),
  ('full-body',2,4,'Bulgarian Split Squat',array['12','12','12'],null),
  ('full-body',2,5,'Seated Dumbbell Lateral Raise',array['12','12','12'],null),
  ('full-body',2,6,'Plate-Loaded Seated Dip',array['12','12','12'],null),
  ('full-body',2,7,'Plate-Loaded Chest Fly',array['12','12','12'],null);

create temp table _stock_catalog_new_versions (
  program_id uuid primary key,
  family_slug text not null unique
) on commit drop;

do $$
declare
  stock_owner uuid;
  stock_coach uuid;
begin
  select family.owner_user_id, version.coach_user_id
  into stock_owner, stock_coach
  from public.program_families family
  join public.training_programs version on version.program_family_id = family.id
  where family.slug = 'smooth-bear-current'
    and version.slug = 'smooth-bear-current-meso-1'
    and family.source_type = 'phatbot_stock'
    and family.visibility = 'stock_catalog'
    and version.status = 'published';

  if stock_owner is null or stock_coach is null or stock_owner is distinct from stock_coach then
    raise exception 'Reviewed Smooth Bear stock-program owner/coach could not be resolved';
  end if;

  insert into public.program_families (
    slug, name, source_type, owner_user_id, created_by_user_id, visibility, status
  )
  select family_slug, name, 'phatbot_stock', stock_owner, stock_owner, 'stock_catalog', 'active'
  from _stock_catalog_programs
  on conflict (slug) do nothing;

  if exists (
    select 1
    from _stock_catalog_programs expected
    left join public.program_families actual on actual.slug = expected.family_slug
    where actual.id is null
       or actual.name is distinct from expected.name
       or actual.source_type is distinct from 'phatbot_stock'
       or actual.owner_user_id is distinct from stock_owner
       or actual.created_by_user_id is distinct from stock_owner
       or actual.visibility is distinct from 'stock_catalog'
       or actual.status is distinct from 'active'
  ) then
    raise exception 'Existing stock program family conflicts with the reviewed catalog';
  end if;

  with inserted as (
    insert into public.training_programs (
      program_family_id, coach_user_id, name, slug, description, status,
      version_number, published_at, authored_by_user_id, published_by_user_id,
      derived_from_program_version_id, customized_for_athlete_user_id, sequence_mode
    )
    select
      family.id, stock_coach, expected.name, expected.family_slug || '-v1',
      expected.description, 'draft', 1, null, stock_owner, null, null, null, 'rotation'
    from _stock_catalog_programs expected
    join public.program_families family on family.slug = expected.family_slug
    where not exists (
      select 1 from public.training_programs existing
      where existing.program_family_id = family.id and existing.version_number = 1
    )
    returning id, program_family_id
  )
  insert into _stock_catalog_new_versions (program_id, family_slug)
  select inserted.id, family.slug
  from inserted
  join public.program_families family on family.id = inserted.program_family_id;

  insert into public.training_program_days (program_id, day_number, name)
  select new_version.program_id, expected.day_number, expected.name
  from _stock_catalog_days expected
  join _stock_catalog_new_versions new_version using (family_slug)
  order by expected.family_slug, expected.day_number;

  insert into public.training_program_exercises (
    program_day_id, exercise_id, position, prescribed_set_targets, notes
  )
  select
    day.id, canonical.id, expected.position, expected.prescribed_set_targets, expected.notes
  from _stock_catalog_prescriptions expected
  join _stock_catalog_new_versions new_version using (family_slug)
  join public.training_program_days day
    on day.program_id = new_version.program_id
   and day.day_number = expected.day_number
  join public.exercises canonical
    on canonical.is_standard = true
   and canonical.normalized_name = lower(trim(expected.canonical_name))
  order by expected.family_slug, expected.day_number, expected.position;

  update public.training_programs version
  set status = 'published',
      published_at = clock_timestamp(),
      published_by_user_id = stock_owner
  where version.id in (select program_id from _stock_catalog_new_versions);

  if exists (
    select 1
    from _stock_catalog_programs expected
    join public.program_families family on family.slug = expected.family_slug
    left join public.training_programs actual
      on actual.program_family_id = family.id and actual.version_number = 1
    where actual.id is null
       or actual.coach_user_id is distinct from stock_coach
       or actual.name is distinct from expected.name
       or actual.slug is distinct from expected.family_slug || '-v1'
       or actual.description is distinct from expected.description
       or actual.status is distinct from 'published'
       or actual.published_at is null
       or actual.authored_by_user_id is distinct from stock_owner
       or actual.published_by_user_id is distinct from stock_owner
       or actual.derived_from_program_version_id is not null
       or actual.customized_for_athlete_user_id is not null
       or actual.sequence_mode is distinct from 'rotation'
  ) then
    raise exception 'Existing stock program v1 conflicts with the reviewed catalog';
  end if;
end
$$;

do $$
begin
  if exists (
    (
      select expected.family_slug, expected.day_number, expected.name
      from _stock_catalog_days expected
      except
      select family.slug, day.day_number, day.name
      from public.program_families family
      join public.training_programs version on version.program_family_id = family.id and version.version_number = 1
      join public.training_program_days day on day.program_id = version.id
      where family.slug in (select family_slug from _stock_catalog_programs)
    )
    union all
    (
      select family.slug, day.day_number, day.name
      from public.program_families family
      join public.training_programs version on version.program_family_id = family.id and version.version_number = 1
      join public.training_program_days day on day.program_id = version.id
      where family.slug in (select family_slug from _stock_catalog_programs)
      except
      select expected.family_slug, expected.day_number, expected.name
      from _stock_catalog_days expected
    )
  ) then
    raise exception 'Existing stock program day order conflicts with the reviewed catalog';
  end if;

  if exists (
    (
      select
        expected.family_slug, expected.day_number, expected.position,
        expected.canonical_name, expected.prescribed_set_targets, expected.notes
      from _stock_catalog_prescriptions expected
      except
      select
        family.slug, day.day_number, prescription.position,
        canonical.name, prescription.prescribed_set_targets, prescription.notes
      from public.program_families family
      join public.training_programs version on version.program_family_id = family.id and version.version_number = 1
      join public.training_program_days day on day.program_id = version.id
      join public.training_program_exercises prescription on prescription.program_day_id = day.id
      join public.exercises canonical on canonical.id = prescription.exercise_id
      where family.slug in (select family_slug from _stock_catalog_programs)
    )
    union all
    (
      select
        family.slug, day.day_number, prescription.position,
        canonical.name, prescription.prescribed_set_targets, prescription.notes
      from public.program_families family
      join public.training_programs version on version.program_family_id = family.id and version.version_number = 1
      join public.training_program_days day on day.program_id = version.id
      join public.training_program_exercises prescription on prescription.program_day_id = day.id
      join public.exercises canonical on canonical.id = prescription.exercise_id
      where family.slug in (select family_slug from _stock_catalog_programs)
      except
      select
        expected.family_slug, expected.day_number, expected.position,
        expected.canonical_name, expected.prescribed_set_targets, expected.notes
      from _stock_catalog_prescriptions expected
    )
  ) then
    raise exception 'Existing stock program exercise prescriptions conflict with the source workbooks';
  end if;
end
$$;
