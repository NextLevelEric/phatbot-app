-- Harden authenticated SECURITY DEFINER RPC authorization boundaries.
-- These functions intentionally remain SECURITY DEFINER, but callers must not
-- be able to ask privileged helpers questions about another arbitrary user.

create or replace function public.has_coach_dashboard_access(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    auth.uid() is not null
    and p_user_id = auth.uid()
    and exists (
      select 1
      from public.coach_profiles
      where user_id = auth.uid()
        and dashboard_enabled = true
    );
$function$;

create or replace function public.get_program_day_options(p_athlete_user_id uuid default null)
returns table(
  assignment_id uuid,
  program_day_id uuid,
  day_number integer,
  is_optional boolean,
  next_program_day_id uuid,
  cursor_revision bigint,
  following_day_number integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
    and assignment.status = 'active'
  window rotation as (partition by assignment.id order by day.day_number)
  order by assignment.id, day.day_number;
end $function$;
