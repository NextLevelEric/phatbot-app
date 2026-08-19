alter table public.coach_workout_feedback
add column if not exists athlete_read_at timestamptz;

create index if not exists coach_workout_feedback_unread_idx
on public.coach_workout_feedback(athlete_user_id, updated_at desc)
where athlete_read_at is null;

create or replace function public.mark_coach_feedback_read(p_workout_session_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coach_workout_feedback
  set athlete_read_at = now()
  where workout_session_id = p_workout_session_id
    and athlete_user_id = auth.uid()
    and athlete_read_at is null;
$$;

revoke all on function public.mark_coach_feedback_read(uuid) from public;
grant execute on function public.mark_coach_feedback_read(uuid) to authenticated;
