-- Authoritative next-workout rotation for athlete program assignments.
--
-- The assignment owns one durable cursor. Program sessions retain explicit
-- assignment/day linkage and advance the cursor only when the still-expected
-- session transitions from in_progress to completed. No historical workout,
-- score, result, or program definition is rewritten by this migration.

alter table public.athlete_program_enrollments
  add column next_program_day_id uuid
    references public.training_program_days(id) on delete restrict;

update public.athlete_program_enrollments assignment
set next_program_day_id = (
  select day.id
  from public.training_program_days day
  where day.program_id = assignment.program_id
  order by day.day_number
  limit 1
);

do $$
begin
  if exists (
    select 1
    from public.athlete_program_enrollments
    where next_program_day_id is null
  ) then
    raise exception 'Every assigned program version must contain at least one ordered workout';
  end if;
end
$$;

alter table public.athlete_program_enrollments
  alter column next_program_day_id set not null;

comment on column public.athlete_program_enrollments.next_program_day_id is
  'Authoritative next workout cursor for this assignment. Changes only after successful completion of the currently expected linked program session.';

create index athlete_program_enrollments_next_day_idx
  on public.athlete_program_enrollments (next_program_day_id);

alter table public.workout_sessions
  add column program_assignment_id uuid
    references public.athlete_program_enrollments(id) on delete restrict,
  add column program_day_id uuid
    references public.training_program_days(id) on delete restrict,
  add column program_sequence_advanced_at timestamptz,
  add constraint workout_sessions_program_link_complete_check
    check (
      (program_assignment_id is null and program_day_id is null)
      or (program_assignment_id is not null and program_day_id is not null)
    );

comment on column public.workout_sessions.program_assignment_id is
  'Exact historical assignment that produced this program workout session.';
comment on column public.workout_sessions.program_day_id is
  'Exact immutable program day snapshot source for this workout session.';
comment on column public.workout_sessions.program_sequence_advanced_at is
  'Set once, transactionally, when this completion advanced its assignment cursor.';

create index workout_sessions_program_assignment_idx
  on public.workout_sessions (program_assignment_id, started_at desc)
  where program_assignment_id is not null;
create index workout_sessions_program_day_idx
  on public.workout_sessions (program_day_id, started_at desc)
  where program_day_id is not null;

-- Slice 2's switching primitive now initializes every new assignment at the
-- first ordered day. A repeated assignment request is idempotent; supplying a
-- non-null review date may update that inert coaching metadata in place.
create or replace function phatbot_private.switch_program_assignment(
  p_athlete_user_id uuid,
  p_program_id uuid,
  p_source_type text,
  p_assigned_by_user_id uuid,
  p_review_due_at timestamptz
)
returns public.athlete_program_enrollments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing_assignment public.athlete_program_enrollments%rowtype;
  new_assignment public.athlete_program_enrollments%rowtype;
  first_program_day_id uuid;
  switched_at timestamptz := clock_timestamp();
begin
  if p_athlete_user_id is null or p_program_id is null then
    raise exception 'Athlete and program version are required';
  end if;

  if p_source_type not in ('coach_assigned', 'athlete_selected', 'athlete_created', 'system_migration') then
    raise exception 'Unsupported assignment source';
  end if;

  if p_source_type <> 'system_migration' and p_assigned_by_user_id is null then
    raise exception 'An assigning user is required';
  end if;

  if not exists (
    select 1 from public.athlete_profiles ap
    where ap.user_id = p_athlete_user_id
  ) then
    raise exception 'Athlete not found';
  end if;

  if not exists (
    select 1
    from public.training_programs p
    join public.program_families f on f.id = p.program_family_id
    where p.id = p_program_id
      and p.status = 'published'
      and f.status = 'active'
  ) then
    raise exception 'Program version is not eligible for assignment';
  end if;

  select day.id
  into first_program_day_id
  from public.training_program_days day
  where day.program_id = p_program_id
  order by day.day_number
  limit 1;

  if first_program_day_id is null then
    raise exception 'Program version has no ordered workouts';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    1346912596,
    pg_catalog.hashtext(p_athlete_user_id::text)
  );

  select assignment.*
  into existing_assignment
  from public.athlete_program_enrollments assignment
  where assignment.athlete_user_id = p_athlete_user_id
    and assignment.status = 'active'
  for update;

  if existing_assignment.id is not null
    and existing_assignment.program_id = p_program_id
    and existing_assignment.source_type = p_source_type
    and existing_assignment.assigned_by_user_id is not distinct from p_assigned_by_user_id
  then
    if p_review_due_at is not null
      and existing_assignment.review_due_at is distinct from p_review_due_at
    then
      update public.athlete_program_enrollments assignment
      set review_due_at = p_review_due_at
      where assignment.id = existing_assignment.id
      returning * into existing_assignment;
    end if;
    return existing_assignment;
  end if;

  update public.athlete_program_enrollments assignment
  set status = 'ended',
      ended_at = switched_at
  where assignment.athlete_user_id = p_athlete_user_id
    and assignment.status = 'active';

  insert into public.athlete_program_enrollments (
    athlete_user_id,
    program_id,
    status,
    source_type,
    assigned_by_user_id,
    review_due_at,
    next_program_day_id,
    started_at,
    ended_at,
    created_at,
    updated_at
  )
  values (
    p_athlete_user_id,
    p_program_id,
    'active',
    p_source_type,
    p_assigned_by_user_id,
    p_review_due_at,
    first_program_day_id,
    switched_at,
    null,
    switched_at,
    switched_at
  )
  returning * into new_assignment;

  return new_assignment;
end
$$;

revoke execute on function phatbot_private.switch_program_assignment(uuid, uuid, text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function phatbot_private.switch_program_assignment(uuid, uuid, text, uuid, timestamptz)
  to service_role;

-- Read model for the athlete or an actively connected coach. One row is
-- returned per ordered prescription; a day with no prescriptions still
-- returns one row with nullable exercise fields. No active assignment returns
-- an empty result set.
create or replace function public.get_next_program_workout(
  p_athlete_user_id uuid default null
)
returns table (
  assignment_id uuid,
  athlete_user_id uuid,
  review_due_at timestamptz,
  program_family_id uuid,
  program_family_name text,
  program_version_id uuid,
  program_version_name text,
  version_number integer,
  program_day_id uuid,
  day_number integer,
  day_name text,
  exercise_position integer,
  exercise_id uuid,
  canonical_exercise_id uuid,
  exercise_display_name text,
  prescribed_set_targets text[],
  exercise_notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  target_athlete_user_id uuid := coalesce(p_athlete_user_id, caller_user_id);
begin
  if caller_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_athlete_user_id <> caller_user_id
    and not exists (
      select 1
      from public.coach_athletes ca
      where ca.coach_user_id = caller_user_id
        and ca.athlete_user_id = target_athlete_user_id
        and ca.active = true
    )
  then
    raise exception 'Not authorized to read this athlete''s next program workout';
  end if;

  return query
  select
    assignment.id,
    assignment.athlete_user_id,
    assignment.review_due_at,
    family.id,
    family.name,
    version.id,
    version.name,
    version.version_number,
    day.id,
    day.day_number,
    day.name,
    prescription.position,
    exercise.id,
    coalesce(exercise.canonical_exercise_id, exercise.id),
    exercise.name,
    prescription.prescribed_set_targets,
    prescription.notes
  from public.athlete_program_enrollments assignment
  join public.training_programs version on version.id = assignment.program_id
  join public.program_families family on family.id = version.program_family_id
  join public.training_program_days day on day.id = assignment.next_program_day_id
  left join public.training_program_exercises prescription on prescription.program_day_id = day.id
  left join public.exercises exercise on exercise.id = prescription.exercise_id
  where assignment.athlete_user_id = target_athlete_user_id
    and assignment.status = 'active'
  order by prescription.position nulls last;
end
$$;

revoke execute on function public.get_next_program_workout(uuid)
  from public, anon;
grant execute on function public.get_next_program_workout(uuid)
  to authenticated, service_role;

-- Program linkage may only be established by the narrow start RPC and becomes
-- immutable immediately. Ordinary/custom workout inserts remain unchanged.
create or replace function phatbot_private.guard_program_workout_session_link()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.program_assignment_id is distinct from old.program_assignment_id
      or new.program_day_id is distinct from old.program_day_id
      or new.program_sequence_advanced_at is distinct from old.program_sequence_advanced_at
    then
      raise exception 'Program workout linkage is immutable';
    end if;
    return new;
  end if;

  if new.program_sequence_advanced_at is not null then
    raise exception 'Program advancement marker is server-managed';
  end if;

  if new.program_assignment_id is null and new.program_day_id is null then
    return new;
  end if;

  if current_setting('phatbot.start_program_assignment_id', true)
      is distinct from new.program_assignment_id::text
  then
    raise exception 'Program workouts must be started through the next-workout action';
  end if;

  if new.athlete_user_id is distinct from (select auth.uid()) then
    raise exception 'Athletes may only start their own program workout';
  end if;

  if not exists (
    select 1
    from public.athlete_program_enrollments assignment
    join public.training_program_days day on day.id = new.program_day_id
    where assignment.id = new.program_assignment_id
      and assignment.athlete_user_id = new.athlete_user_id
      and assignment.status = 'active'
      and assignment.next_program_day_id = new.program_day_id
      and day.program_id = assignment.program_id
  ) then
    raise exception 'Program workout does not match the active assignment cursor';
  end if;

  return new;
end
$$;

revoke execute on function phatbot_private.guard_program_workout_session_link()
  from public, anon, authenticated;
grant execute on function phatbot_private.guard_program_workout_session_link()
  to service_role;

create trigger workout_sessions_program_link_guard
before insert or update of program_assignment_id, program_day_id, program_sequence_advanced_at
on public.workout_sessions
for each row execute function phatbot_private.guard_program_workout_session_link();

-- Start only the caller's current expected program day. The hidden workout row
-- is created lazily once per assignment/day solely to preserve existing
-- workout_id-based comparison behavior; program content is always snapshotted
-- from the immutable version, never from an editable athlete template.
create or replace function public.start_my_next_program_workout()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  active_assignment public.athlete_program_enrollments%rowtype;
  next_day public.training_program_days%rowtype;
  comparison_workout_id uuid;
  new_session_id uuid;
begin
  if caller_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    1346912596,
    pg_catalog.hashtext(caller_user_id::text)
  );

  select assignment.*
  into active_assignment
  from public.athlete_program_enrollments assignment
  where assignment.athlete_user_id = caller_user_id
    and assignment.status = 'active'
  for update;

  if active_assignment.id is null then
    raise exception 'No active program assignment';
  end if;

  if exists (
    select 1
    from public.workout_sessions session
    where session.athlete_user_id = caller_user_id
      and session.status = 'in_progress'
  ) then
    raise exception 'Complete or cancel the active workout before starting another';
  end if;

  select day.*
  into next_day
  from public.training_program_days day
  where day.id = active_assignment.next_program_day_id
    and day.program_id = active_assignment.program_id;

  if next_day.id is null then
    raise exception 'Assignment cursor does not match its immutable program version';
  end if;

  select mapped.workout_id
  into comparison_workout_id
  from public.athlete_program_workouts mapped
  where mapped.enrollment_id = active_assignment.id
    and mapped.program_day_id = next_day.id;

  if comparison_workout_id is null then
    insert into public.workouts (
      athlete_user_id,
      name,
      description,
      is_active
    ) values (
      caller_user_id,
      '__PHATBOT_PROGRAM__ ' || active_assignment.id::text || ' ' || next_day.id::text,
      'Server-managed program comparison identity. Workout content comes from the immutable assigned version.',
      false
    )
    returning id into comparison_workout_id;

    insert into public.athlete_program_workouts (
      enrollment_id,
      program_day_id,
      workout_id
    ) values (
      active_assignment.id,
      next_day.id,
      comparison_workout_id
    );
  end if;

  perform pg_catalog.set_config(
    'phatbot.start_program_assignment_id',
    active_assignment.id::text,
    true
  );

  insert into public.workout_sessions (
    athlete_user_id,
    workout_id,
    workout_name_snapshot,
    status,
    program_assignment_id,
    program_day_id
  ) values (
    caller_user_id,
    comparison_workout_id,
    next_day.name,
    'in_progress',
    active_assignment.id,
    next_day.id
  )
  returning id into new_session_id;

  insert into public.exercise_sessions (
    workout_session_id,
    workout_exercise_id,
    exercise_id,
    exercise_name_snapshot,
    position,
    prescribed_set_targets_snapshot,
    notes
  )
  select
    new_session_id,
    null,
    exercise.id,
    exercise.name,
    prescription.position,
    prescription.prescribed_set_targets,
    prescription.notes
  from public.training_program_exercises prescription
  join public.exercises exercise on exercise.id = prescription.exercise_id
  where prescription.program_day_id = next_day.id
  order by prescription.position;

  if not found then
    raise exception 'Expected program workout has no exercise prescriptions';
  end if;

  return new_session_id;
end
$$;

revoke execute on function public.start_my_next_program_workout()
  from public, anon;
grant execute on function public.start_my_next_program_workout()
  to authenticated, service_role;

-- Completion advancement is part of the same transaction as the authoritative
-- in_progress -> completed session update. Row locking plus the per-session
-- marker makes duplicated completion callbacks idempotent.
create or replace function phatbot_private.advance_program_rotation_on_completion()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  active_assignment public.athlete_program_enrollments%rowtype;
  next_day_id uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  if new.program_assignment_id is null then
    return new;
  end if;

  if old.status <> 'in_progress' then
    raise exception 'Only an in-progress program workout can be completed';
  end if;

  if not exists (
    select 1
    from public.exercise_sessions exercise_session
    join public.sets logged_set on logged_set.exercise_session_id = exercise_session.id
    where exercise_session.workout_session_id = new.id
  ) then
    raise exception 'Log at least one set before completing a program workout';
  end if;

  select assignment.*
  into active_assignment
  from public.athlete_program_enrollments assignment
  where assignment.id = new.program_assignment_id
  for update;

  if active_assignment.id is null
    or active_assignment.status <> 'active'
    or active_assignment.next_program_day_id <> new.program_day_id
    or new.program_sequence_advanced_at is not null
  then
    return new;
  end if;

  select day.id
  into next_day_id
  from public.training_program_days day
  where day.program_id = active_assignment.program_id
    and day.day_number > (
      select current_day.day_number
      from public.training_program_days current_day
      where current_day.id = new.program_day_id
    )
  order by day.day_number
  limit 1;

  if next_day_id is null then
    select day.id
    into next_day_id
    from public.training_program_days day
    where day.program_id = active_assignment.program_id
    order by day.day_number
    limit 1;
  end if;

  if next_day_id is null then
    raise exception 'Assigned program version has no ordered workouts';
  end if;

  update public.athlete_program_enrollments assignment
  set next_program_day_id = next_day_id
  where assignment.id = active_assignment.id;

  new.program_sequence_advanced_at := clock_timestamp();
  return new;
end
$$;

revoke execute on function phatbot_private.advance_program_rotation_on_completion()
  from public, anon, authenticated;
grant execute on function phatbot_private.advance_program_rotation_on_completion()
  to service_role;

create trigger workout_sessions_advance_program_rotation
before update of status on public.workout_sessions
for each row execute function phatbot_private.advance_program_rotation_on_completion();
