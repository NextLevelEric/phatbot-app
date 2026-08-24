create table if not exists public.coach_workout_reviews (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (workout_session_id, coach_user_id)
);

alter table public.coach_workout_reviews enable row level security;

create policy "coaches can view reviews for active athletes"
on public.coach_workout_reviews for select
to authenticated
using (
  coach_user_id = auth.uid()
  and exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = auth.uid()
      and ca.athlete_user_id = coach_workout_reviews.athlete_user_id
      and ca.active = true
  )
);

create policy "coaches can mark active athlete workouts reviewed"
on public.coach_workout_reviews for insert
to authenticated
with check (
  coach_user_id = auth.uid()
  and exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = auth.uid()
      and ca.athlete_user_id = coach_workout_reviews.athlete_user_id
      and ca.active = true
  )
  and exists (
    select 1 from public.workout_sessions ws
    where ws.id = coach_workout_reviews.workout_session_id
      and ws.athlete_user_id = coach_workout_reviews.athlete_user_id
      and ws.status = 'completed'
  )
);

create policy "coaches can refresh their review timestamp"
on public.coach_workout_reviews for update
to authenticated
using (coach_user_id = auth.uid())
with check (
  coach_user_id = auth.uid()
  and exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = auth.uid()
      and ca.athlete_user_id = coach_workout_reviews.athlete_user_id
      and ca.active = true
  )
);

create index if not exists coach_workout_reviews_session_idx
  on public.coach_workout_reviews(workout_session_id);

create index if not exists coach_workout_reviews_athlete_idx
  on public.coach_workout_reviews(athlete_user_id, reviewed_at desc);

-- Preserve the meaning of existing feedback: if a coach already sent feedback on a
-- completed workout, that workout was necessarily reviewed before this table existed.
insert into public.coach_workout_reviews (workout_session_id, athlete_user_id, coach_user_id, reviewed_at, created_at)
select feedback.workout_session_id,
       feedback.athlete_user_id,
       feedback.coach_user_id,
       feedback.updated_at,
       feedback.created_at
from public.coach_workout_feedback feedback
join public.workout_sessions ws on ws.id = feedback.workout_session_id
where ws.status = 'completed'
on conflict (workout_session_id, coach_user_id) do nothing;
