create table if not exists public.coach_workout_feedback (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  feedback text not null check (char_length(feedback) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_session_id, coach_user_id)
);

alter table public.coach_workout_feedback enable row level security;

create policy "coaches can view feedback for active athletes"
on public.coach_workout_feedback for select
to authenticated
using (
  coach_user_id = auth.uid()
  and exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = auth.uid()
      and ca.athlete_user_id = coach_workout_feedback.athlete_user_id
      and ca.active = true
  )
);

create policy "athletes can view their coach feedback"
on public.coach_workout_feedback for select
to authenticated
using (athlete_user_id = auth.uid());

create policy "coaches can add feedback for active athletes"
on public.coach_workout_feedback for insert
to authenticated
with check (
  coach_user_id = auth.uid()
  and exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = auth.uid()
      and ca.athlete_user_id = coach_workout_feedback.athlete_user_id
      and ca.active = true
  )
  and exists (
    select 1 from public.workout_sessions ws
    where ws.id = coach_workout_feedback.workout_session_id
      and ws.athlete_user_id = coach_workout_feedback.athlete_user_id
      and ws.status = 'completed'
  )
);

create policy "coaches can update their feedback"
on public.coach_workout_feedback for update
to authenticated
using (coach_user_id = auth.uid())
with check (
  coach_user_id = auth.uid()
  and exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = auth.uid()
      and ca.athlete_user_id = coach_workout_feedback.athlete_user_id
      and ca.active = true
  )
);

create policy "coaches can delete their feedback"
on public.coach_workout_feedback for delete
to authenticated
using (coach_user_id = auth.uid());

create index if not exists coach_workout_feedback_session_idx on public.coach_workout_feedback(workout_session_id);
create index if not exists coach_workout_feedback_athlete_idx on public.coach_workout_feedback(athlete_user_id, created_at desc);
