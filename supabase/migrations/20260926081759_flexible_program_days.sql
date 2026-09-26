-- Reorder the remainder of one assignment rotation, never the published program.
-- Empty means the normal ascending rotation from next_program_day_id to the last day.
alter table public.athlete_program_enrollments
  add column remaining_program_day_ids uuid[] not null default '{}';

comment on column public.athlete_program_enrollments.remaining_program_day_ids is
  'One-rotation order after an athlete changes today''s prescribed workout; empty uses the published order.';

create or replace function phatbot_private.guard_assignment_day_options()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'ended' and (new.optional_program_day_ids is distinct from old.optional_program_day_ids
      or new.remaining_program_day_ids is distinct from old.remaining_program_day_ids) then
      raise exception 'Historical assignment options are immutable';
    end if;
    if new.program_id is distinct from old.program_id then
      new.optional_program_day_ids := '{}';
      new.remaining_program_day_ids := '{}';
    end if;
    if new.next_program_day_id is distinct from old.next_program_day_id
      or new.program_id is distinct from old.program_id
      or new.status is distinct from old.status
      or new.optional_program_day_ids is distinct from old.optional_program_day_ids
      or new.remaining_program_day_ids is distinct from old.remaining_program_day_ids
      or new.program_cursor_revision is distinct from old.program_cursor_revision then
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
  ) then raise exception 'Optional days must be unique days from the assigned version'; end if;
  if cardinality(new.optional_program_day_ids) > 0 and not exists (
    select 1 from public.training_program_days day
    where day.program_id = new.program_id and not (day.id = any(new.optional_program_day_ids))
  ) then raise exception 'An assignment must retain at least one required day'; end if;

  if cardinality(new.remaining_program_day_ids) > 0 and (
    new.remaining_program_day_ids[1] is distinct from new.next_program_day_id
    or cardinality(new.remaining_program_day_ids) <> (
      select count(distinct requested.id) from unnest(new.remaining_program_day_ids) as requested(id)
    ) or exists (
      select 1 from unnest(new.remaining_program_day_ids) as requested(id)
      where requested.id is null or not exists (
        select 1 from public.training_program_days day
        where day.id = requested.id and day.program_id = new.program_id
      )
    )
  ) then raise exception 'Remaining days must be unique days from this assignment, beginning at its cursor'; end if;
  return new;
end $$;

drop trigger athlete_program_enrollments_day_options_guard on public.athlete_program_enrollments;
create trigger athlete_program_enrollments_day_options_guard
before insert or update of program_id, status, next_program_day_id,
  optional_program_day_ids, remaining_program_day_ids, program_cursor_revision
on public.athlete_program_enrollments
for each row execute function phatbot_private.guard_assignment_day_options();

-- A single transaction reorders and starts a snapshot. No program version,
-- historical workout, or future assignment is edited.
create or replace function public.start_my_selected_program_workout(
  p_assignment_id uuid, p_program_day_id uuid, p_cursor_revision bigint
)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  assignment public.athlete_program_enrollments%rowtype;
  pending uuid[];
  reordered uuid[];
  session_id uuid;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if p_assignment_id is null or p_program_day_id is null or p_cursor_revision is null then
    raise exception 'Assignment, day and revision are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1346912596, pg_catalog.hashtext(caller::text));
  perform phatbot_private.activate_due_program_assignment(caller);
  select a.* into assignment from public.athlete_program_enrollments a
  where a.id = p_assignment_id and a.athlete_user_id = caller and a.status = 'active'
  for update;
  if assignment.id is null then raise exception 'Own active assignment required'; end if;
  if assignment.program_cursor_revision <> p_cursor_revision then
    raise exception 'Program position changed; refresh before starting';
  end if;
  if not exists (
    select 1 from public.training_program_days day
    where day.id = p_program_day_id and day.program_id = assignment.program_id
  ) then raise exception 'Workout day does not belong to the active version'; end if;
  if exists (
    select 1 from public.workout_sessions ws
    where ws.athlete_user_id = caller and ws.status = 'in_progress'
  ) then raise exception 'Complete or cancel the active workout before starting another'; end if;

  if p_program_day_id = assignment.next_program_day_id then
    return phatbot_private.start_program_workout(p_assignment_id, null);
  end if;
  pending := assignment.remaining_program_day_ids;
  if cardinality(pending) = 0 then
    select array_agg(day.id order by day.day_number) into pending
    from public.training_program_days day
    where day.program_id = assignment.program_id
      and day.day_number >= (
        select current_day.day_number from public.training_program_days current_day
        where current_day.id = assignment.next_program_day_id
      );
  end if;
  -- A day already passed in this cycle is an extra session. The still-due
  -- days remain after it; a later day moves to the front without duplication.
  select array_agg(item.id order by item.ordinality) into reordered
  from unnest(pending) with ordinality as item(id, ordinality)
  where item.id <> p_program_day_id;
  reordered := array_prepend(p_program_day_id, coalesce(reordered, '{}'::uuid[]));
  update public.athlete_program_enrollments
  set next_program_day_id = p_program_day_id,
      remaining_program_day_ids = reordered
  where id = assignment.id;
  session_id := phatbot_private.start_program_workout(p_assignment_id, null);
  return session_id;
end $$;
revoke all on function public.start_my_selected_program_workout(uuid, uuid, bigint) from public, anon;
grant execute on function public.start_my_selected_program_workout(uuid, uuid, bigint) to authenticated, service_role;

create or replace function public.skip_my_optional_program_day(
  p_assignment_id uuid, p_program_day_id uuid, p_cursor_revision bigint
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  assignment public.athlete_program_enrollments%rowtype;
  following uuid;
  pending uuid[];
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if p_assignment_id is null or p_program_day_id is null or p_cursor_revision is null then
    raise exception 'Assignment, optional day and cursor revision are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1346912596, pg_catalog.hashtext(caller::text));
  perform phatbot_private.activate_due_program_assignment(caller);
  select a.* into assignment from public.athlete_program_enrollments a
  where a.id = p_assignment_id and a.athlete_user_id = caller and a.status = 'active' for update;
  if assignment.id is null then raise exception 'Own active assignment required'; end if;
  if not (p_program_day_id = any(assignment.optional_program_day_ids)) then
    raise exception 'Only configured optional days may be skipped';
  end if;
  if assignment.next_program_day_id <> p_program_day_id
    or assignment.program_cursor_revision <> p_cursor_revision then return false; end if;
  if exists (select 1 from public.workout_sessions ws
    where ws.athlete_user_id = caller and ws.status = 'in_progress') then
    raise exception 'Complete or cancel the active workout before skipping an optional day';
  end if;
  if cardinality(assignment.remaining_program_day_ids) > 0 then
    pending := assignment.remaining_program_day_ids[2:];
    following := pending[1];
    if following is null then
      select day.id into following from public.training_program_days day
      where day.program_id = assignment.program_id order by day.day_number limit 1;
    end if;
  end if;
  if following is null then
    select day.id into following from public.training_program_days day
    where day.program_id = assignment.program_id
      and day.day_number > (select current_day.day_number from public.training_program_days current_day where current_day.id = p_program_day_id)
    order by day.day_number limit 1;
    if following is null then
      select day.id into following from public.training_program_days day
      where day.program_id = assignment.program_id order by day.day_number limit 1;
    end if;
  end if;
  if following is null then raise exception 'Assigned version has no ordered workouts'; end if;
  update public.athlete_program_enrollments
  set next_program_day_id = following,
      remaining_program_day_ids = coalesce(pending, '{}'::uuid[])
  where id = assignment.id;
  return true;
end $$;
revoke all on function public.skip_my_optional_program_day(uuid, uuid, bigint) from public, anon;
grant execute on function public.skip_my_optional_program_day(uuid, uuid, bigint) to authenticated, service_role;

create or replace function phatbot_private.advance_program_rotation_on_completion()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  assignment public.athlete_program_enrollments%rowtype;
  remaining uuid[];
  following uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  if new.program_assignment_id is null then return new; end if;
  if old.status <> 'in_progress' then
    raise exception 'Only an in-progress program workout can be completed';
  end if;
  if not exists (
    select 1 from public.exercise_sessions es
    join public.sets logged on logged.exercise_session_id = es.id
    where es.workout_session_id = new.id
  ) then raise exception 'Log at least one set before completing a program workout'; end if;
  select a.* into assignment from public.athlete_program_enrollments a
  where a.id = new.program_assignment_id for update;
  if assignment.id is null or assignment.status <> 'active'
    or assignment.next_program_day_id <> new.program_day_id
    or new.program_sequence_advanced_at is not null then return new; end if;
  if cardinality(assignment.remaining_program_day_ids) > 0 then
    remaining := assignment.remaining_program_day_ids[2:];
    following := remaining[1];
    if following is null then
      select day.id into following from public.training_program_days day
      where day.program_id = assignment.program_id order by day.day_number limit 1;
    end if;
  end if;
  if following is null then
    select day.id into following from public.training_program_days day
    where day.program_id = assignment.program_id
      and day.day_number > (select current_day.day_number from public.training_program_days current_day where current_day.id = new.program_day_id)
    order by day.day_number limit 1;
    if following is null then
      select day.id into following from public.training_program_days day
      where day.program_id = assignment.program_id order by day.day_number limit 1;
    end if;
  end if;
  if following is null then raise exception 'Assigned program version has no ordered workouts'; end if;
  update public.athlete_program_enrollments
  set next_program_day_id = following,
      remaining_program_day_ids = coalesce(remaining, '{}'::uuid[])
  where id = assignment.id;
  new.program_sequence_advanced_at := clock_timestamp();
  return new;
end $$;
revoke all on function phatbot_private.advance_program_rotation_on_completion() from public, anon, authenticated;
grant execute on function phatbot_private.advance_program_rotation_on_completion() to service_role;

-- Keep the optional-day skip label honest when a previous selection has
-- reordered the rest of this rotation.
create or replace function public.get_program_day_options(p_athlete_user_id uuid default null)
returns table (
  assignment_id uuid, program_day_id uuid, day_number integer,
  is_optional boolean, next_program_day_id uuid, cursor_revision bigint,
  following_day_number integer
)
language plpgsql stable security definer set search_path = '' as $$
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
    case when day.id = assignment.next_program_day_id
       and cardinality(assignment.remaining_program_day_ids) > 1
      then (select following.day_number from public.training_program_days following
        where following.id = assignment.remaining_program_day_ids[2])
      else coalesce(lead(day.day_number) over rotation, first_value(day.day_number) over rotation)
    end
  from public.athlete_program_enrollments assignment
  join public.training_program_days day on day.program_id = assignment.program_id
  where assignment.athlete_user_id = athlete_id
  window rotation as (partition by assignment.id order by day.day_number)
  order by assignment.id, day.day_number;
end $$;
revoke all on function public.get_program_day_options(uuid) from public, anon;
grant execute on function public.get_program_day_options(uuid) to authenticated, service_role;
