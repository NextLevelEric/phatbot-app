-- Authoritative athlete-to-program-version assignment history.
--
-- This migration does not assign any athlete, materialize program workouts, or
-- modify workout/session history. It removes the legacy automatic signup
-- enrollment and makes all normal assignment writes pass through a narrow,
-- transaction-safe RPC.

-- Stop new signups from racing this migration by creating legacy enrollments
-- and athlete-owned workout copies while the table is being upgraded.
drop trigger if exists default_new_athlete_eric_program on public.athlete_profiles;
drop function if exists public.default_new_athlete_to_eric_program();

alter table public.athlete_program_enrollments
  rename column enrolled_at to started_at;

alter table public.athlete_program_enrollments
  drop constraint athlete_program_enrollments_athlete_user_id_program_id_key,
  drop constraint athlete_program_enrollments_status_check,
  add column source_type text,
  add column assigned_by_user_id uuid references public.profiles(id) on delete restrict,
  add column created_at timestamptz,
  add column updated_at timestamptz;

-- Production had no enrollment rows when this migration was authored. These
-- deterministic backfills preserve any row created before rollout instead of
-- deleting it or inventing a coach attribution.
update public.athlete_program_enrollments
set status = case when status = 'active' then 'active' else 'ended' end,
    ended_at = case
      when status = 'active' then null
      else coalesce(ended_at, started_at)
    end,
    source_type = 'system_migration',
    created_at = started_at,
    updated_at = coalesce(ended_at, started_at);

alter table public.athlete_program_enrollments
  alter column source_type set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  add constraint athlete_program_enrollments_status_check
    check (status in ('active', 'ended')),
  add constraint athlete_program_enrollments_source_type_check
    check (source_type in ('coach_assigned', 'athlete_selected', 'athlete_created', 'system_migration')),
  add constraint athlete_program_enrollments_ended_at_check
    check (
      (status = 'active' and ended_at is null)
      or (status = 'ended' and ended_at is not null)
    ),
  add constraint athlete_program_enrollments_assigner_check
    check (source_type = 'system_migration' or assigned_by_user_id is not null),
  add constraint athlete_program_enrollments_end_after_start_check
    check (ended_at is null or ended_at >= started_at);

comment on table public.athlete_program_enrollments is
  'Historical athlete assignments to exact immutable training_programs versions.';
comment on column public.athlete_program_enrollments.program_id is
  'Exact immutable training_programs version assigned; never a program family reference.';
comment on column public.athlete_program_enrollments.source_type is
  'Assignment origin: coach, athlete stock selection, athlete-created program, or controlled system migration.';

do $$
begin
  if exists (
    select 1
    from public.athlete_program_enrollments
    where status = 'active'
    group by athlete_user_id
    having count(*) > 1
  ) then
    raise exception 'Existing athlete has more than one active program assignment';
  end if;
end
$$;

create unique index athlete_program_enrollments_one_active_idx
  on public.athlete_program_enrollments (athlete_user_id)
  where status = 'active';
create index athlete_program_enrollments_history_idx
  on public.athlete_program_enrollments (athlete_user_id, started_at desc);
create index athlete_program_enrollments_program_id_idx
  on public.athlete_program_enrollments (program_id);
create index athlete_program_enrollments_assigned_by_idx
  on public.athlete_program_enrollments (assigned_by_user_id)
  where assigned_by_user_id is not null;

create trigger athlete_program_enrollments_set_updated_at
before update on public.athlete_program_enrollments
for each row execute function public.set_updated_at();

revoke all on table public.athlete_program_enrollments from anon, authenticated;
grant select on table public.athlete_program_enrollments to authenticated;
grant all on table public.athlete_program_enrollments to service_role;

drop policy if exists "athletes read own program enrollments"
  on public.athlete_program_enrollments;

create policy athlete_program_assignments_read_permitted
on public.athlete_program_enrollments
for select
to authenticated
using (
  athlete_user_id = (select auth.uid())
  or exists (
    select 1
    from public.coach_athletes ca
    where ca.coach_user_id = (select auth.uid())
      and ca.athlete_user_id = athlete_program_enrollments.athlete_user_id
      and ca.active = true
  )
);

-- Materialized workouts remain a Slice 3 concern. Keep the existing read path,
-- but remove unused direct mutation privileges from client roles.
revoke all on table public.athlete_program_workouts from anon, authenticated;
grant select on table public.athlete_program_workouts to authenticated;
grant all on table public.athlete_program_workouts to service_role;

-- Internal switching primitive. Keep it outside the exposed public schema. It
-- serializes changes for one athlete and relies on the partial unique index as
-- a second concurrency guard.
create schema if not exists phatbot_private;
revoke all on schema phatbot_private from public, anon, authenticated;
grant usage on schema phatbot_private to service_role;

create or replace function phatbot_private.switch_program_assignment(
  p_athlete_user_id uuid,
  p_program_id uuid,
  p_source_type text,
  p_assigned_by_user_id uuid
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
    switched_at,
    null,
    switched_at,
    switched_at
  )
  returning * into new_assignment;

  return new_assignment;
end
$$;

revoke execute on function phatbot_private.switch_program_assignment(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function phatbot_private.switch_program_assignment(uuid, uuid, text, uuid)
  to service_role;

create or replace function public.assign_program_to_athlete(
  p_athlete_user_id uuid,
  p_program_id uuid,
  p_source_type text
)
returns public.athlete_program_enrollments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  is_connected_coach boolean;
  is_eligible_program boolean := false;
begin
  if caller_user_id is null then
    raise exception 'Authentication required';
  end if;

  select exists (
    select 1
    from public.coach_athletes ca
    where ca.coach_user_id = caller_user_id
      and ca.athlete_user_id = p_athlete_user_id
      and ca.active = true
  ) into is_connected_coach;

  if caller_user_id = p_athlete_user_id then
    if p_source_type = 'athlete_selected' then
      select exists (
        select 1
        from public.training_programs p
        join public.program_families f on f.id = p.program_family_id
        where p.id = p_program_id
          and p.status = 'published'
          and f.status = 'active'
          and f.source_type = 'phatbot_stock'
          and f.visibility = 'stock_catalog'
      ) into is_eligible_program;
    elsif p_source_type = 'athlete_created' then
      select exists (
        select 1
        from public.training_programs p
        join public.program_families f on f.id = p.program_family_id
        where p.id = p_program_id
          and p.status = 'published'
          and f.status = 'active'
          and f.owner_user_id = caller_user_id
          and f.source_type in ('athlete', 'athlete_fork')
          and f.visibility = 'private'
          and (
            p.customized_for_athlete_user_id is null
            or p.customized_for_athlete_user_id = p_athlete_user_id
          )
      ) into is_eligible_program;
    else
      raise exception 'Athletes may only select stock or athlete-owned programs';
    end if;
  elsif is_connected_coach then
    if p_source_type <> 'coach_assigned' then
      raise exception 'Coach assignments require coach_assigned source';
    end if;

    select exists (
      select 1
      from public.training_programs p
      join public.program_families f on f.id = p.program_family_id
      where p.id = p_program_id
        and p.status = 'published'
        and f.status = 'active'
        and (
          (f.source_type = 'phatbot_stock' and f.visibility = 'stock_catalog')
          or (
            f.source_type = 'coach'
            and f.owner_user_id = caller_user_id
            and f.visibility in ('private', 'coach_library')
          )
          or (
            p.customized_for_athlete_user_id = p_athlete_user_id
            and p.authored_by_user_id = caller_user_id
          )
        )
    ) into is_eligible_program;
  else
    raise exception 'Not authorized to assign this athlete';
  end if;

  if not is_eligible_program then
    raise exception 'Program version is not eligible for assignment';
  end if;

  return phatbot_private.switch_program_assignment(
    p_athlete_user_id,
    p_program_id,
    p_source_type,
    caller_user_id
  );
end
$$;

revoke execute on function public.assign_program_to_athlete(uuid, uuid, text)
  from public, anon;
grant execute on function public.assign_program_to_athlete(uuid, uuid, text)
  to authenticated, service_role;

-- Read model for either the current athlete or an actively connected coach.
-- It exposes assignment/program metadata only; no workouts or athlete health data.
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
  created_at timestamptz,
  updated_at timestamptz
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
    raise exception 'Not authorized to read this athlete''s program assignments';
  end if;

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
    assignment.created_at,
    assignment.updated_at
  from public.athlete_program_enrollments assignment
  join public.training_programs version on version.id = assignment.program_id
  join public.program_families family on family.id = version.program_family_id
  left join public.profiles assigner on assigner.id = assignment.assigned_by_user_id
  where assignment.athlete_user_id = target_athlete_user_id
  order by assignment.started_at desc, assignment.id desc;
end
$$;

revoke execute on function public.get_athlete_program_assignments(uuid)
  from public, anon;
grant execute on function public.get_athlete_program_assignments(uuid)
  to authenticated, service_role;

-- Preserve the existing athlete-facing RPC contract while routing it through
-- the authoritative assignment layer. It no longer materializes workouts.
create or replace function public.enroll_in_current_eric_program()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  current_program_id uuid;
  assignment public.athlete_program_enrollments%rowtype;
begin
  if caller_user_id is null then
    raise exception 'Authentication required';
  end if;

  select p.id
  into current_program_id
  from public.training_programs p
  join public.program_families f on f.id = p.program_family_id
  where p.status = 'published'
    and f.source_type = 'phatbot_stock'
    and f.visibility = 'stock_catalog'
    and f.slug = 'smooth-bear-current'
  order by p.version_number desc
  limit 1;

  if current_program_id is null then
    raise exception 'No published Eric program';
  end if;

  assignment := public.assign_program_to_athlete(
    caller_user_id,
    current_program_id,
    'athlete_selected'
  );
  return assignment.id;
end
$$;

revoke execute on function public.enroll_in_current_eric_program()
  from public, anon;
grant execute on function public.enroll_in_current_eric_program()
  to authenticated, service_role;

-- Keep the service-role helper signature for controlled compatibility, but
-- route it through the same non-materializing switching primitive.
create or replace function public.enroll_athlete_in_current_eric_program(p_user uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_program_id uuid;
  assignment public.athlete_program_enrollments%rowtype;
begin
  select p.id
  into current_program_id
  from public.training_programs p
  join public.program_families f on f.id = p.program_family_id
  where p.status = 'published'
    and f.source_type = 'phatbot_stock'
    and f.visibility = 'stock_catalog'
    and f.slug = 'smooth-bear-current'
  order by p.version_number desc
  limit 1;

  if current_program_id is null then
    return null;
  end if;

  assignment := phatbot_private.switch_program_assignment(
    p_user,
    current_program_id,
    'system_migration',
    null
  );
  return assignment.id;
end
$$;

revoke execute on function public.enroll_athlete_in_current_eric_program(uuid)
  from public, anon, authenticated;
grant execute on function public.enroll_athlete_in_current_eric_program(uuid)
  to service_role;
