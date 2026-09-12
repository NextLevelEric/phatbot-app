-- Complete PHATBOT's existing canonical-exercise identity layer without rewriting
-- workout history. Canonical metadata is controlled; athlete/coach-created rows
-- remain valid aliases or standalone custom identities.

create type public.exercise_muscle_group as enum (
  'chest','back','quads','hamstrings','glutes','shoulders','biceps','triceps','calves','core','full_body','other'
);
create type public.exercise_movement_pattern as enum (
  'horizontal_push','vertical_push','horizontal_pull','vertical_pull','squat','hinge','lunge','carry','core','isolation','other'
);
create type public.exercise_equipment_category as enum (
  'barbell','dumbbell','machine','cable','bodyweight','kettlebell','smith_machine','bands','other'
);
create type public.exercise_classification as enum ('compound','isolation');
create type public.exercise_laterality as enum ('bilateral','unilateral');
create type public.exercise_setup as enum ('flat','incline','decline','seated','standing','kneeling','chest_supported','other');

alter table public.exercises
  add column primary_muscle_group public.exercise_muscle_group,
  add column movement_pattern public.exercise_movement_pattern,
  add column equipment_category public.exercise_equipment_category,
  add column exercise_class public.exercise_classification,
  add column laterality public.exercise_laterality,
  add column setup public.exercise_setup;

create table public.exercise_secondary_muscles (
  canonical_exercise_id uuid not null references public.exercises(id) on delete cascade,
  muscle_group public.exercise_muscle_group not null,
  position smallint not null default 1 check (position > 0),
  primary key (canonical_exercise_id, muscle_group),
  unique (canonical_exercise_id, position)
);

create table public.exercise_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_name text not null check (length(trim(alias_name)) > 0),
  normalized_alias text generated always as (lower(trim(alias_name))) stored,
  canonical_exercise_id uuid not null references public.exercises(id) on delete restrict,
  review_note text not null,
  created_at timestamptz not null default now(),
  unique (normalized_alias)
);

create index exercise_secondary_muscles_group_idx
  on public.exercise_secondary_muscles(muscle_group, canonical_exercise_id);
create index exercise_aliases_canonical_exercise_id_idx
  on public.exercise_aliases(canonical_exercise_id);
create index exercises_metadata_lookup_idx
  on public.exercises(primary_muscle_group, movement_pattern, exercise_class)
  where is_standard = true and is_active = true;
create index exercises_equipment_lookup_idx
  on public.exercises(equipment_category, setup)
  where is_standard = true and is_active = true;

alter table public.exercise_secondary_muscles enable row level security;
alter table public.exercise_aliases enable row level security;

revoke all on table public.exercise_secondary_muscles from anon, authenticated;
revoke all on table public.exercise_aliases from anon, authenticated;
grant select on table public.exercise_secondary_muscles to authenticated;
grant select on table public.exercise_aliases to authenticated;

create policy exercise_secondary_muscles_read
  on public.exercise_secondary_muscles for select to authenticated using (true);
create policy exercise_aliases_read
  on public.exercise_aliases for select to authenticated using (true);

create policy exercises_read_permitted_history
  on public.exercises for select to authenticated
  using (
    exists (
      select 1
      from public.exercise_sessions es
      join public.workout_sessions ws on ws.id = es.workout_session_id
      where es.exercise_id = exercises.id
        and public.can_access_athlete(ws.athlete_user_id)
    )
  );

-- Users may create and maintain the original descriptive fields on their own
-- exercises, but canonical identity and controlled metadata are library-owned.
revoke insert, update on table public.exercises from anon, authenticated;
grant select on table public.exercises to authenticated;
grant insert (name, muscle_group, equipment, is_active, created_by)
  on table public.exercises to authenticated;
grant update (name, muscle_group, equipment, is_active)
  on table public.exercises to authenticated;

create or replace function public.enforce_exercise_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_alias_canonical_id uuid;
begin
  if tg_op = 'UPDATE' and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if new.created_by is distinct from old.created_by
      or new.canonical_exercise_id is distinct from old.canonical_exercise_id
      or new.is_standard is distinct from old.is_standard
      or new.is_custom is distinct from old.is_custom
      or new.primary_muscle_group is distinct from old.primary_muscle_group
      or new.movement_pattern is distinct from old.movement_pattern
      or new.equipment_category is distinct from old.equipment_category
      or new.exercise_class is distinct from old.exercise_class
      or new.laterality is distinct from old.laterality
      or new.setup is distinct from old.setup then
      raise exception 'Canonical exercise identity and metadata are library-managed';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id is null then new.id := gen_random_uuid(); end if;

    if new.created_by is not null then
      new.is_standard := false;
      new.is_custom := true;
      new.primary_muscle_group := null;
      new.movement_pattern := null;
      new.equipment_category := null;
      new.exercise_class := null;
      new.laterality := null;
      new.setup := null;

      select e.id into v_alias_canonical_id
      from public.exercises e
      where e.is_standard = true
        and e.normalized_name = lower(trim(new.name))
      limit 1;

      if v_alias_canonical_id is null then
        select a.canonical_exercise_id into v_alias_canonical_id
        from public.exercise_aliases a
        where a.normalized_alias = lower(trim(new.name));
      end if;
      new.canonical_exercise_id := coalesce(v_alias_canonical_id, new.id);
    elsif new.is_standard then
      new.is_custom := false;
      new.canonical_exercise_id := new.id;
    else
      new.is_custom := false;
      new.canonical_exercise_id := coalesce(new.canonical_exercise_id, new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists exercises_enforce_identity on public.exercises;
create trigger exercises_enforce_identity
before insert or update on public.exercises
for each row execute function public.enforce_exercise_identity();

-- All pre-existing creator-owned rows are nonstandard/custom rows. This labels
-- their origin only; it does not merge, rename, or delete any exercise.
update public.exercises
set is_custom = true,
    canonical_exercise_id = coalesce(canonical_exercise_id, id)
where created_by is not null and is_standard = false;

update public.exercises
set canonical_exercise_id = id
where canonical_exercise_id is null;

-- A deliberately small, clearly understood standard library. More exercises can
-- be reviewed and added later without changing the data model.
insert into public.exercises (
  name, muscle_group, equipment, is_active, created_by, is_standard, is_custom,
  primary_muscle_group, movement_pattern, equipment_category, exercise_class, laterality, setup
)
select * from (values
  ('Barbell Bench Press','Chest','Barbell',true,null::uuid,true,false,'chest'::public.exercise_muscle_group,'horizontal_push'::public.exercise_movement_pattern,'barbell'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'flat'::public.exercise_setup),
  ('Dumbbell Bench Press','Chest','Dumbbell',true,null::uuid,true,false,'chest'::public.exercise_muscle_group,'horizontal_push'::public.exercise_movement_pattern,'dumbbell'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'flat'::public.exercise_setup),
  ('Incline Dumbbell Bench Press','Chest','Dumbbell',true,null::uuid,true,false,'chest'::public.exercise_muscle_group,'horizontal_push'::public.exercise_movement_pattern,'dumbbell'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'incline'::public.exercise_setup),
  ('Smith Machine Bench Press','Chest','Smith Machine',true,null::uuid,true,false,'chest'::public.exercise_muscle_group,'horizontal_push'::public.exercise_movement_pattern,'smith_machine'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'flat'::public.exercise_setup),
  ('Chest Press Machine','Chest','Machine',true,null::uuid,true,false,'chest'::public.exercise_muscle_group,'horizontal_push'::public.exercise_movement_pattern,'machine'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'seated'::public.exercise_setup),
  ('Cable Fly','Chest','Cable',true,null::uuid,true,false,'chest'::public.exercise_muscle_group,'isolation'::public.exercise_movement_pattern,'cable'::public.exercise_equipment_category,'isolation'::public.exercise_classification,'bilateral'::public.exercise_laterality,'standing'::public.exercise_setup),
  ('Barbell Back Squat','Quads','Barbell',true,null::uuid,true,false,'quads'::public.exercise_muscle_group,'squat'::public.exercise_movement_pattern,'barbell'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'standing'::public.exercise_setup),
  ('Front Squat','Quads','Barbell',true,null::uuid,true,false,'quads'::public.exercise_muscle_group,'squat'::public.exercise_movement_pattern,'barbell'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'standing'::public.exercise_setup),
  ('Smith Machine Squat','Quads','Smith Machine',true,null::uuid,true,false,'quads'::public.exercise_muscle_group,'squat'::public.exercise_movement_pattern,'smith_machine'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'standing'::public.exercise_setup),
  ('Romanian Deadlift','Hamstrings','Barbell',true,null::uuid,true,false,'hamstrings'::public.exercise_muscle_group,'hinge'::public.exercise_movement_pattern,'barbell'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'standing'::public.exercise_setup),
  ('Conventional Deadlift','Glutes','Barbell',true,null::uuid,true,false,'glutes'::public.exercise_muscle_group,'hinge'::public.exercise_movement_pattern,'barbell'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'standing'::public.exercise_setup),
  ('Lat Pulldown','Back','Cable',true,null::uuid,true,false,'back'::public.exercise_muscle_group,'vertical_pull'::public.exercise_movement_pattern,'cable'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'seated'::public.exercise_setup),
  ('Neutral-Grip Lat Pulldown','Back','Cable',true,null::uuid,true,false,'back'::public.exercise_muscle_group,'vertical_pull'::public.exercise_movement_pattern,'cable'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'seated'::public.exercise_setup),
  ('Seated Cable Row','Back','Cable',true,null::uuid,true,false,'back'::public.exercise_muscle_group,'horizontal_pull'::public.exercise_movement_pattern,'cable'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'seated'::public.exercise_setup),
  ('Bent-Over Barbell Row','Back','Barbell',true,null::uuid,true,false,'back'::public.exercise_muscle_group,'horizontal_pull'::public.exercise_movement_pattern,'barbell'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'standing'::public.exercise_setup),
  ('Chest-Supported Dumbbell Row','Back','Dumbbell',true,null::uuid,true,false,'back'::public.exercise_muscle_group,'horizontal_pull'::public.exercise_movement_pattern,'dumbbell'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'chest_supported'::public.exercise_setup),
  ('Leg Press','Quads','Machine',true,null::uuid,true,false,'quads'::public.exercise_muscle_group,'squat'::public.exercise_movement_pattern,'machine'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'seated'::public.exercise_setup),
  ('Dumbbell Shoulder Press','Shoulders','Dumbbell',true,null::uuid,true,false,'shoulders'::public.exercise_muscle_group,'vertical_push'::public.exercise_movement_pattern,'dumbbell'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'seated'::public.exercise_setup),
  ('Barbell Overhead Press','Shoulders','Barbell',true,null::uuid,true,false,'shoulders'::public.exercise_muscle_group,'vertical_push'::public.exercise_movement_pattern,'barbell'::public.exercise_equipment_category,'compound'::public.exercise_classification,'bilateral'::public.exercise_laterality,'standing'::public.exercise_setup)
) as seed(name,muscle_group,equipment,is_active,created_by,is_standard,is_custom,primary_muscle_group,movement_pattern,equipment_category,exercise_class,laterality,setup)
where not exists (
  select 1 from public.exercises e
  where e.is_standard = true and e.normalized_name = lower(trim(seed.name))
);

-- Reviewed aliases only. Generic/ambiguous labels are intentionally absent.
with reviewed(alias_name, canonical_name, review_note) as (values
  ('DB Bench','Dumbbell Bench Press','Common unambiguous dumbbell abbreviation'),
  ('Dumbbell Bench','Dumbbell Bench Press','Flat dumbbell bench shorthand'),
  ('Dumb Bell Bench Press','Dumbbell Bench Press','Spacing variant'),
  ('Flat Barbell Bench Press','Barbell Bench Press','Explicit flat barbell variation'),
  ('Incline Dumbbell Bench','Incline Dumbbell Bench Press','Press suffix omitted'),
  ('Incline Dumbbell Press','Incline Dumbbell Bench Press','Bench implied by explicit incline dumbbell press label'),
  ('RDL','Romanian Deadlift','Standard abbreviation'),
  ('RDLs','Romanian Deadlift','Plural standard abbreviation'),
  ('Traditional Deadlift','Conventional Deadlift','Traditional label used for conventional stance'),
  ('Bent Over Barbell Row','Bent-Over Barbell Row','Hyphenation variant'),
  ('Chest Supported Dumbell Row','Chest-Supported Dumbbell Row','Spelling and hyphenation variant'),
  ('Neutral Grip Pull Down','Neutral-Grip Lat Pulldown','Spacing variant with explicit neutral grip'),
  ('Neutral Grip Pulldown','Neutral-Grip Lat Pulldown','Hyphenation variant with explicit neutral grip')
), resolved as (
  select r.alias_name, r.review_note, e.id canonical_exercise_id
  from reviewed r
  join public.exercises e on e.is_standard = true and e.normalized_name = lower(trim(r.canonical_name))
)
insert into public.exercise_aliases(alias_name, canonical_exercise_id, review_note)
select alias_name, canonical_exercise_id, review_note from resolved
on conflict (normalized_alias) do update
set canonical_exercise_id = excluded.canonical_exercise_id,
    review_note = excluded.review_note;

-- Map only rows whose exact normalized label is in the reviewed alias registry.
-- No exercise/session/set/workout row is rewritten or deleted.
update public.exercises e
set canonical_exercise_id = a.canonical_exercise_id
from public.exercise_aliases a
where e.normalized_name = a.normalized_alias
  and e.is_standard = false
  and e.canonical_exercise_id is distinct from a.canonical_exercise_id;

-- An exact canonical library name is deterministic too. This captures historical
-- creator-owned duplicates whose label already matches the reviewed standard row.
update public.exercises e
set canonical_exercise_id = c.id
from public.exercises c
where c.is_standard = true
  and e.is_standard = false
  and e.normalized_name = c.normalized_name
  and e.canonical_exercise_id is distinct from c.id;

with secondary(canonical_name, muscle_group, position) as (values
  ('Barbell Bench Press','triceps'::public.exercise_muscle_group,1),
  ('Barbell Bench Press','shoulders'::public.exercise_muscle_group,2),
  ('Dumbbell Bench Press','triceps'::public.exercise_muscle_group,1),
  ('Dumbbell Bench Press','shoulders'::public.exercise_muscle_group,2),
  ('Incline Dumbbell Bench Press','triceps'::public.exercise_muscle_group,1),
  ('Incline Dumbbell Bench Press','shoulders'::public.exercise_muscle_group,2),
  ('Smith Machine Bench Press','triceps'::public.exercise_muscle_group,1),
  ('Smith Machine Bench Press','shoulders'::public.exercise_muscle_group,2),
  ('Chest Press Machine','triceps'::public.exercise_muscle_group,1),
  ('Chest Press Machine','shoulders'::public.exercise_muscle_group,2),
  ('Barbell Back Squat','glutes'::public.exercise_muscle_group,1),
  ('Barbell Back Squat','hamstrings'::public.exercise_muscle_group,2),
  ('Front Squat','glutes'::public.exercise_muscle_group,1),
  ('Romanian Deadlift','glutes'::public.exercise_muscle_group,1),
  ('Romanian Deadlift','back'::public.exercise_muscle_group,2),
  ('Conventional Deadlift','hamstrings'::public.exercise_muscle_group,1),
  ('Conventional Deadlift','back'::public.exercise_muscle_group,2),
  ('Lat Pulldown','biceps'::public.exercise_muscle_group,1),
  ('Neutral-Grip Lat Pulldown','biceps'::public.exercise_muscle_group,1),
  ('Seated Cable Row','biceps'::public.exercise_muscle_group,1),
  ('Bent-Over Barbell Row','biceps'::public.exercise_muscle_group,1),
  ('Chest-Supported Dumbbell Row','biceps'::public.exercise_muscle_group,1),
  ('Leg Press','glutes'::public.exercise_muscle_group,1),
  ('Dumbbell Shoulder Press','triceps'::public.exercise_muscle_group,1),
  ('Barbell Overhead Press','triceps'::public.exercise_muscle_group,1)
), resolved as (
  select e.id canonical_exercise_id, s.muscle_group, s.position
  from secondary s
  join public.exercises e on e.is_standard = true and e.normalized_name = lower(trim(s.canonical_name))
)
insert into public.exercise_secondary_muscles(canonical_exercise_id,muscle_group,position)
select canonical_exercise_id,muscle_group,position from resolved
on conflict (canonical_exercise_id,muscle_group) do update set position=excluded.position;

-- Replace the original view with an RLS-respecting invoker view and expose the
-- controlled metadata needed by exercise discovery and future substitutions.
create or replace view public.exercise_identity
with (security_invoker = true)
as
select
  e.id as exercise_id,
  e.name as recorded_name,
  e.normalized_name,
  coalesce(e.canonical_exercise_id,e.id) as canonical_exercise_id,
  coalesce(c.name,e.name) as canonical_name,
  coalesce(c.muscle_group,e.muscle_group) as canonical_muscle_group,
  coalesce(c.equipment,e.equipment) as canonical_equipment,
  coalesce(c.is_standard,e.is_standard) as is_standard,
  e.is_custom,
  c.primary_muscle_group,
  c.movement_pattern,
  c.equipment_category,
  c.exercise_class,
  c.laterality,
  c.setup
from public.exercises e
left join public.exercises c on c.id = coalesce(e.canonical_exercise_id,e.id);

grant select on public.exercise_identity to authenticated;

create view public.canonical_exercise_sessions
with (security_invoker = true)
as
select
  es.id as exercise_session_id,
  es.workout_session_id,
  ws.athlete_user_id,
  es.exercise_id as recorded_exercise_id,
  es.exercise_name_snapshot as recorded_name,
  coalesce(e.canonical_exercise_id,e.id) as canonical_exercise_id,
  coalesce(c.name,e.name,es.exercise_name_snapshot) as canonical_name,
  es.position,
  ws.completed_at
from public.exercise_sessions es
join public.workout_sessions ws on ws.id=es.workout_session_id
left join public.exercises e on e.id=es.exercise_id
left join public.exercises c on c.id=coalesce(e.canonical_exercise_id,e.id);

revoke all on public.canonical_exercise_sessions from anon;
grant select on public.canonical_exercise_sessions to authenticated;

comment on table public.exercise_aliases is
  'Reviewed exact aliases only. PHATBOT does not use fuzzy matching to assign canonical exercise identity.';
comment on table public.exercise_secondary_muscles is
  'Controlled secondary muscle metadata for canonical standard exercises.';
comment on view public.canonical_exercise_sessions is
  'RLS-respecting projection for grouping athlete or authorized-coach workout history by canonical movement.';
