-- Optional days belong to an assignment, never its immutable program version.
-- Defaults leave every existing assignment on its normal required-day rotation.
alter table public.athlete_program_enrollments
  add column optional_program_day_ids uuid[] not null default '{}',
  add column program_cursor_revision bigint not null default 0
    check (program_cursor_revision >= 0);

comment on column public.athlete_program_enrollments.optional_program_day_ids is
  'Server-configured optional days from this exact assigned version. Empty means every day is required.';
comment on column public.athlete_program_enrollments.program_cursor_revision is
  'Optimistic sequencing token. A stale optional-day skip cannot advance a later rotation.';
comment on column public.athlete_program_enrollments.next_program_day_id is
  'Next expected day; advances on expected linked completion or an explicit optional-day skip.';

create or replace function phatbot_private.guard_assignment_day_options()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'ended' and new.optional_program_day_ids is distinct from old.optional_program_day_ids then
      raise exception 'Historical assignment options are immutable';
    end if;
    -- The existing scheduling RPC may replace a future version in the same row.
    -- Never carry old-version day IDs into the new assignment configuration.
    if new.program_id is distinct from old.program_id then
      new.optional_program_day_ids := '{}';
    end if;
    if new.next_program_day_id is distinct from old.next_program_day_id
      or new.program_id is distinct from old.program_id
      or new.status is distinct from old.status
      or new.optional_program_day_ids is distinct from old.optional_program_day_ids
      or new.program_cursor_revision is distinct from old.program_cursor_revision
    then
      new.program_cursor_revision := old.program_cursor_revision + 1;
    end if;
  end if;

  if exists (
    select 1 from unnest(new.optional_program_day_ids) as requested(id)
    where requested.id is null or not exists (
      select 1 from public.training_program_days day
      where day.id = requested.id and day.program_id = new.program_id
    )
  ) or cardinality(new.optional_program_day_ids) <> (
    select count(distinct requested.id) from unnest(new.optional_program_day_ids) as requested(id)
  ) then
    raise exception 'Optional days must be unique days from the assigned version';
  end if;
  if cardinality(new.optional_program_day_ids) > 0 and not exists (
    select 1 from public.training_program_days day
    where day.program_id = new.program_id and not (day.id = any(new.optional_program_day_ids))
  ) then
    raise exception 'An assignment must retain at least one required day';
  end if;
  return new;
end
$$;
revoke all on function phatbot_private.guard_assignment_day_options() from public, anon, authenticated;
grant execute on function phatbot_private.guard_assignment_day_options() to service_role;

create trigger athlete_program_enrollments_day_options_guard
before insert or update of program_id, status, next_program_day_id, optional_program_day_ids, program_cursor_revision
on public.athlete_program_enrollments
for each row execute function phatbot_private.guard_assignment_day_options();

-- Controlled server/admin operation only, following the existing private-schema
-- assignment primitives. Client roles retain SELECT-only enrollment privileges.
create or replace function phatbot_private.set_assignment_optional_days(
  p_assignment_id uuid, p_program_day_ids uuid[]
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  athlete_id uuid;
begin
  select athlete_user_id into athlete_id from public.athlete_program_enrollments where id = p_assignment_id;
  if athlete_id is null or p_program_day_ids is null then raise exception 'Assignment and optional day list are required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1346912596, pg_catalog.hashtext(athlete_id::text));
  update public.athlete_program_enrollments
  set optional_program_day_ids = p_program_day_ids
  where id = p_assignment_id and status in ('scheduled', 'active');
  if not found then raise exception 'Only current or scheduled assignments may be configured'; end if;
end
$$;
revoke all on function phatbot_private.set_assignment_optional_days(uuid, uuid[]) from public, anon, authenticated;
grant execute on function phatbot_private.set_assignment_optional_days(uuid, uuid[]) to service_role;

-- Companion read model avoids changing the signatures of existing program RPCs.
-- It is genuinely read-only; callers load it after the existing activation-aware
-- assignment RPC. Ended options remain available for historical coach display.
create or replace function public.get_program_day_options(p_athlete_user_id uuid default null)
returns table (
  assignment_id uuid, program_day_id uuid, day_number integer,
  is_optional boolean, next_program_day_id uuid, cursor_revision bigint,
  following_day_number integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  athlete_id uuid := coalesce(p_athlete_user_id, caller);
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if athlete_id <> caller and not exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = caller and ca.athlete_user_id = athlete_id and ca.active = true
  ) then raise exception 'Not authorized to read this athlete''s program options'; end if;
  return query
  select assignment.id, day.id, day.day_number,
    day.id = any(assignment.optional_program_day_ids), assignment.next_program_day_id,
    assignment.program_cursor_revision,
    coalesce(lead(day.day_number) over rotation, first_value(day.day_number) over rotation)
  from public.athlete_program_enrollments assignment
  join public.training_program_days day on day.program_id = assignment.program_id
  where assignment.athlete_user_id = athlete_id
  window rotation as (partition by assignment.id order by day.day_number)
  order by assignment.id, day.day_number;
end
$$;
revoke all on function public.get_program_day_options(uuid) from public, anon;
grant execute on function public.get_program_day_options(uuid) to authenticated, service_role;

-- Compare both the exact day and revision under the same assignment lock used by
-- starts/completions. Replayed/stale requests are a no-op, including a whole cycle
-- later when the cursor has returned to the same optional day.
create or replace function public.skip_my_optional_program_day(
  p_assignment_id uuid, p_program_day_id uuid, p_cursor_revision bigint
)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  assignment public.athlete_program_enrollments%rowtype;
  next_day uuid;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if p_assignment_id is null or p_program_day_id is null or p_cursor_revision is null then
    raise exception 'Assignment, optional day and cursor revision are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1346912596, pg_catalog.hashtext(caller::text));
  perform phatbot_private.activate_due_program_assignment(caller);
  select a.* into assignment from public.athlete_program_enrollments a
  where a.id = p_assignment_id and a.athlete_user_id = caller and a.status = 'active'
  for update;
  if assignment.id is null then raise exception 'Own active assignment required'; end if;
  if not (p_program_day_id = any(assignment.optional_program_day_ids)) then
    raise exception 'Only configured optional days may be skipped';
  end if;
  if assignment.next_program_day_id <> p_program_day_id or assignment.program_cursor_revision <> p_cursor_revision then
    return false;
  end if;
  if exists (select 1 from public.workout_sessions ws where ws.athlete_user_id = caller and ws.status = 'in_progress') then
    raise exception 'Complete or cancel the active workout before skipping an optional day';
  end if;
  select day.id into next_day from public.training_program_days day
  where day.program_id = assignment.program_id
  order by (day.day_number > (select current_day.day_number from public.training_program_days current_day where current_day.id = p_program_day_id)) desc,
    day.day_number
  limit 1;
  if next_day is null then raise exception 'Assigned version has no ordered workouts'; end if;
  update public.athlete_program_enrollments
  set next_program_day_id = next_day, program_cursor_revision = program_cursor_revision + 1
  where id = assignment.id;
  return true;
end
$$;
revoke all on function public.skip_my_optional_program_day(uuid, uuid, bigint) from public, anon;
grant execute on function public.skip_my_optional_program_day(uuid, uuid, bigint) to authenticated, service_role;


-- Reuse the existing immutable snapshot/comparison-identity start implementation
-- for both expected and deliberately selected optional days.
create or replace function phatbot_private.start_program_workout(p_assignment_id uuid, p_optional_day_id uuid)
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

  if p_assignment_id is not null and p_assignment_id <> active_assignment.id then
    raise exception 'Assignment changed; refresh before starting';
  end if;
  if p_optional_day_id is not null and not (p_optional_day_id = any(active_assignment.optional_program_day_ids)) then
    raise exception 'Only configured optional days may be started outside the rotation';
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
  where day.id = coalesce(p_optional_day_id, active_assignment.next_program_day_id)
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
revoke all on function phatbot_private.start_program_workout(uuid, uuid) from public, anon, authenticated;
grant execute on function phatbot_private.start_program_workout(uuid, uuid) to service_role;

create or replace function public.start_my_next_program_workout()
returns uuid language sql volatile security definer set search_path = ''
as $$ select phatbot_private.start_program_workout(null, null); $$;
revoke all on function public.start_my_next_program_workout() from public, anon;
grant execute on function public.start_my_next_program_workout() to authenticated, service_role;

create or replace function public.start_my_optional_program_workout(p_assignment_id uuid, p_program_day_id uuid)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_assignment_id is null or p_program_day_id is null then
    raise exception 'Assignment and optional day are required';
  end if;
  return phatbot_private.start_program_workout(p_assignment_id, p_program_day_id);
end
$$;
revoke all on function public.start_my_optional_program_workout(uuid, uuid) from public, anon;
grant execute on function public.start_my_optional_program_workout(uuid, uuid) to authenticated, service_role;

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
      and (assignment.next_program_day_id = new.program_day_id
        or new.program_day_id = any(assignment.optional_program_day_ids))
      and day.program_id = assignment.program_id
  ) then
    raise exception 'Program workout does not match the active assignment cursor';
  end if;

  return new;
end
$$;
revoke all on function phatbot_private.guard_program_workout_session_link() from public, anon, authenticated;
grant execute on function phatbot_private.guard_program_workout_session_link() to service_role;

-- The existing still-expected-day check remains authoritative. Bonus completion
-- records real training but leaves the expected-day cursor and revision alone.
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
  set next_program_day_id = next_day_id,
      program_cursor_revision = assignment.program_cursor_revision + 1
  where assignment.id = active_assignment.id;

  new.program_sequence_advanced_at := clock_timestamp();
  return new;
end
$$;
revoke all on function phatbot_private.advance_program_rotation_on_completion() from public, anon, authenticated;
grant execute on function phatbot_private.advance_program_rotation_on_completion() to service_role;
