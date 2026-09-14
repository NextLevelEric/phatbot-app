-- Narrow coach-owned review-date management for an active athlete assignment.
-- Review dates are attention metadata only and do not participate in rotation,
-- assignment lifecycle, workout completion, or program versioning.

create or replace function public.set_program_assignment_review_due_at(
  p_athlete_user_id uuid,
  p_review_due_at timestamptz
)
returns public.athlete_program_enrollments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  updated_assignment public.athlete_program_enrollments%rowtype;
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
    raise exception 'Not authorized to manage this athlete''s program review date';
  end if;

  select assignment.*
  into updated_assignment
  from public.athlete_program_enrollments assignment
  where assignment.athlete_user_id = p_athlete_user_id
    and assignment.status = 'active'
  for update;

  if updated_assignment.id is null then
    raise exception 'No active program assignment';
  end if;

  update public.athlete_program_enrollments assignment
  set review_due_at = p_review_due_at
  where assignment.id = updated_assignment.id
  returning * into updated_assignment;

  return updated_assignment;
end
$$;

revoke execute on function public.set_program_assignment_review_due_at(uuid, timestamptz)
  from public, anon;
grant execute on function public.set_program_assignment_review_due_at(uuid, timestamptz)
  to authenticated, service_role;
