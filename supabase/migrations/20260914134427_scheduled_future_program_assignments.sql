-- One future coach-scheduled program may coexist with an athlete's current
-- assignment. The existing started_at column is the effective instant:
-- midnight America/New_York on the coach-selected calendar date.

alter table public.athlete_program_enrollments
  drop constraint athlete_program_enrollments_status_check,
  drop constraint athlete_program_enrollments_ended_at_check,
  add constraint athlete_program_enrollments_status_check
    check (status in ('active', 'scheduled', 'ended')),
  add constraint athlete_program_enrollments_ended_at_check
    check (
      (status in ('active', 'scheduled') and ended_at is null)
      or (status = 'ended' and ended_at is not null)
    );

create unique index athlete_program_enrollments_one_scheduled_idx
  on public.athlete_program_enrollments (athlete_user_id)
  where status = 'scheduled';

create index athlete_program_enrollments_scheduled_due_idx
  on public.athlete_program_enrollments (started_at, athlete_user_id)
  where status = 'scheduled';

comment on column public.athlete_program_enrollments.started_at is
  'Effective assignment instant. Scheduled assignments use midnight America/New_York on the selected starts_on date.';

create or replace function phatbot_private.activate_due_program_assignment(
  p_athlete_user_id uuid,
  p_as_of timestamptz default clock_timestamp()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  scheduled_assignment public.athlete_program_enrollments%rowtype;
  active_assignment public.athlete_program_enrollments%rowtype;
  first_program_day_id uuid;
  activated_at timestamptz;
begin
  if p_athlete_user_id is null then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    1346912596,
    pg_catalog.hashtext(p_athlete_user_id::text)
  );

  select assignment.*
  into scheduled_assignment
  from public.athlete_program_enrollments assignment
  where assignment.athlete_user_id = p_athlete_user_id
    and assignment.status = 'scheduled'
    and assignment.started_at <= p_as_of
  for update;

  if scheduled_assignment.id is null then
    return false;
  end if;

  activated_at := greatest(clock_timestamp(), scheduled_assignment.started_at);

  select day.id
  into first_program_day_id
  from public.training_program_days day
  where day.program_id = scheduled_assignment.program_id
  order by day.day_number, day.id
  limit 1;

  if first_program_day_id is null then
    raise exception 'Scheduled program version has no ordered workouts';
  end if;

  select assignment.*
  into active_assignment
  from public.athlete_program_enrollments assignment
  where assignment.athlete_user_id = p_athlete_user_id
    and assignment.status = 'active'
  for update;

  if active_assignment.id is not null then
    update public.athlete_program_enrollments assignment
    set status = 'ended',
        ended_at = activated_at
    where assignment.id = active_assignment.id;
  end if;

  update public.athlete_program_enrollments assignment
  set status = 'active',
      next_program_day_id = first_program_day_id,
      ended_at = null
  where assignment.id = scheduled_assignment.id;

  return true;
end
$$;

revoke execute on function phatbot_private.activate_due_program_assignment(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function phatbot_private.activate_due_program_assignment(uuid, timestamptz)
  to service_role;

create or replace function phatbot_private.activate_due_program_assignments(
  p_as_of timestamptz default clock_timestamp()
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate record;
  activated_count integer := 0;
begin
  for candidate in
    select assignment.athlete_user_id
    from public.athlete_program_enrollments assignment
    where assignment.status = 'scheduled'
      and assignment.started_at <= p_as_of
    order by assignment.athlete_user_id
  loop
    if phatbot_private.activate_due_program_assignment(candidate.athlete_user_id, p_as_of) then
      activated_count := activated_count + 1;
    end if;
  end loop;

  return activated_count;
end
$$;

revoke execute on function phatbot_private.activate_due_program_assignments(timestamptz)
  from public, anon, authenticated;
grant execute on function phatbot_private.activate_due_program_assignments(timestamptz)
  to service_role;

create or replace function public.schedule_program_for_athlete(
  p_athlete_user_id uuid,
  p_program_id uuid,
  p_starts_on date,
  p_review_due_at timestamptz default null
)
returns public.athlete_program_enrollments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  effective_at timestamptz;
  first_program_day_id uuid;
  existing_scheduled public.athlete_program_enrollments%rowtype;
  scheduled_assignment public.athlete_program_enrollments%rowtype;
begin
  if caller_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_athlete_user_id is null or p_program_id is null or p_starts_on is null then
    raise exception 'Athlete, program version, and start date are required';
  end if;

  if not exists (
    select 1
    from public.coach_athletes relationship
    where relationship.coach_user_id = caller_user_id
      and relationship.athlete_user_id = p_athlete_user_id
      and relationship.active = true
  ) then
    raise exception 'Not authorized to schedule this athlete';
  end if;

  if p_starts_on <= (clock_timestamp() at time zone 'America/New_York')::date then
    raise exception 'Scheduled program start date must be in the future';
  end if;

  effective_at := p_starts_on::timestamp at time zone 'America/New_York';

  select day.id
  into first_program_day_id
  from public.training_programs version
  join public.program_families family on family.id = version.program_family_id
  join public.training_program_days day on day.program_id = version.id
  where version.id = p_program_id
    and version.status = 'published'
    and family.status = 'active'
    and (
      (family.source_type = 'phatbot_stock' and family.visibility = 'stock_catalog')
      or (
        family.source_type = 'coach'
        and family.owner_user_id = caller_user_id
        and family.visibility in ('private', 'coach_library')
      )
      or (
        version.customized_for_athlete_user_id = p_athlete_user_id
        and version.authored_by_user_id = caller_user_id
      )
    )
  order by day.day_number, day.id
  limit 1;

  if first_program_day_id is null then
    raise exception 'Program version is not eligible for assignment or has no ordered workouts';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    1346912596,
    pg_catalog.hashtext(p_athlete_user_id::text)
  );

  select assignment.*
  into existing_scheduled
  from public.athlete_program_enrollments assignment
  where assignment.athlete_user_id = p_athlete_user_id
    and assignment.status = 'scheduled'
  for update;

  if existing_scheduled.id is not null
    and existing_scheduled.program_id = p_program_id
    and existing_scheduled.started_at = effective_at
    and existing_scheduled.review_due_at is not distinct from p_review_due_at
    and existing_scheduled.assigned_by_user_id = caller_user_id
  then
    return existing_scheduled;
  end if;

  if existing_scheduled.id is not null then
    update public.athlete_program_enrollments assignment
    set program_id = p_program_id,
        source_type = 'coach_assigned',
        assigned_by_user_id = caller_user_id,
        review_due_at = p_review_due_at,
        next_program_day_id = first_program_day_id,
        started_at = effective_at,
        ended_at = null
    where assignment.id = existing_scheduled.id
    returning * into scheduled_assignment;
  else
    insert into public.athlete_program_enrollments (
      athlete_user_id,
      program_id,
      status,
      source_type,
      assigned_by_user_id,
      review_due_at,
      next_program_day_id,
      started_at,
      ended_at
    ) values (
      p_athlete_user_id,
      p_program_id,
      'scheduled',
      'coach_assigned',
      caller_user_id,
      p_review_due_at,
      first_program_day_id,
      effective_at,
      null
    )
    returning * into scheduled_assignment;
  end if;

  return scheduled_assignment;
end
$$;

revoke execute on function public.schedule_program_for_athlete(uuid, uuid, date, timestamptz)
  from public, anon;
grant execute on function public.schedule_program_for_athlete(uuid, uuid, date, timestamptz)
  to authenticated, service_role;

create or replace function public.cancel_scheduled_program_for_athlete(
  p_athlete_user_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  removed_count integer;
begin
  if caller_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.coach_athletes relationship
    where relationship.coach_user_id = caller_user_id
      and relationship.athlete_user_id = p_athlete_user_id
      and relationship.active = true
  ) then
    raise exception 'Not authorized to cancel this athlete''s scheduled program';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    1346912596,
    pg_catalog.hashtext(p_athlete_user_id::text)
  );

  delete from public.athlete_program_enrollments assignment
  where assignment.athlete_user_id = p_athlete_user_id
    and assignment.status = 'scheduled';
  get diagnostics removed_count = row_count;

  return removed_count > 0;
end
$$;

revoke execute on function public.cancel_scheduled_program_for_athlete(uuid)
  from public, anon;
grant execute on function public.cancel_scheduled_program_for_athlete(uuid)
  to authenticated, service_role;

-- Existing read contract, now with idempotent lazy activation before results.
create or replace function public.get_athlete_program_assignments(
  p_athlete_user_id uuid default null
)
returns table (
  assignment_id uuid,
  athlete_user_id uuid,
  program_version_id uuid,
  program_family_id uuid,
  program_name text,
  program_family_name text,
  version_number integer,
  assignment_status text,
  source_type text,
  assigned_by_user_id uuid,
  assigned_by_display_name text,
  started_at timestamptz,
  ended_at timestamptz,
  review_due_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
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
      select 1 from public.coach_athletes relationship
      where relationship.coach_user_id = caller_user_id
        and relationship.athlete_user_id = target_athlete_user_id
        and relationship.active = true
    )
  then
    raise exception 'Not authorized to read this athlete''s program assignments';
  end if;

  perform phatbot_private.activate_due_program_assignment(target_athlete_user_id);

  return query
  select
    assignment.id,
    assignment.athlete_user_id,
    version.id,
    family.id,
    version.name,
    family.name,
    version.version_number,
    assignment.status,
    assignment.source_type,
    assignment.assigned_by_user_id,
    assigner.display_name,
    assignment.started_at,
    assignment.ended_at,
    assignment.review_due_at,
    assignment.created_at,
    assignment.updated_at
  from public.athlete_program_enrollments assignment
  join public.training_programs version on version.id = assignment.program_id
  join public.program_families family on family.id = version.program_family_id
  left join public.profiles assigner on assigner.id = assignment.assigned_by_user_id
  where assignment.athlete_user_id = target_athlete_user_id
  order by
    case assignment.status when 'scheduled' then 0 when 'active' then 1 else 2 end,
    assignment.started_at desc,
    assignment.id desc;
end
$$;

revoke execute on function public.get_athlete_program_assignments(uuid)
  from public, anon;
grant execute on function public.get_athlete_program_assignments(uuid)
  to authenticated, service_role;

-- Existing next-workout return contract, with the same lazy activation guard.
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
volatile
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
      select 1 from public.coach_athletes relationship
      where relationship.coach_user_id = caller_user_id
        and relationship.athlete_user_id = target_athlete_user_id
        and relationship.active = true
    )
  then
    raise exception 'Not authorized to read this athlete''s next program workout';
  end if;

  perform phatbot_private.activate_due_program_assignment(target_athlete_user_id);

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

-- Existing start contract, with activation reconciled under the same athlete lock.
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
  perform phatbot_private.activate_due_program_assignment(caller_user_id);

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
    select 1 from public.workout_sessions session
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
    insert into public.workouts (athlete_user_id, name, description, is_active)
    values (
      caller_user_id,
      '__PHATBOT_PROGRAM__ ' || active_assignment.id::text || ' ' || next_day.id::text,
      'Server-managed program comparison identity. Workout content comes from the immutable assigned version.',
      false
    )
    returning id into comparison_workout_id;

    insert into public.athlete_program_workouts (enrollment_id, program_day_id, workout_id)
    values (active_assignment.id, next_day.id, comparison_workout_id);
  end if;

  perform pg_catalog.set_config('phatbot.start_program_assignment_id', active_assignment.id::text, true);

  insert into public.workout_sessions (
    athlete_user_id, workout_id, workout_name_snapshot, status,
    program_assignment_id, program_day_id
  ) values (
    caller_user_id, comparison_workout_id, next_day.name, 'in_progress',
    active_assignment.id, next_day.id
  )
  returning id into new_session_id;

  insert into public.exercise_sessions (
    workout_session_id, workout_exercise_id, exercise_id,
    exercise_name_snapshot, position, prescribed_set_targets_snapshot, notes
  )
  select
    new_session_id, null, exercise.id, exercise.name, prescription.position,
    prescription.prescribed_set_targets, prescription.notes
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

-- Run shortly after each minute boundary. Lazy reconciliation above is the
-- second safety net if a Cron run is delayed.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception 'pg_cron schedule function is required for future program activation';
  end if;

  if not exists (
    select 1 from cron.job where jobname = 'phatbot-scheduled-program-activation'
  ) then
    perform cron.schedule(
      'phatbot-scheduled-program-activation',
      '* * * * *',
      'select phatbot_private.activate_due_program_assignments();'
    );
  end if;
end
$$;
