create table if not exists public.exercise_coaching_adjustments (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_session_id uuid not null references public.exercise_sessions(id) on delete cascade,
  exercise_id uuid not null,
  adjustment_type text not null check (adjustment_type in ('plateau_rebuild')),
  source text not null default 'phatbot' check (source in ('phatbot')),
  suggested_weight numeric,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (exercise_session_id, adjustment_type)
);

alter table public.exercise_coaching_adjustments enable row level security;

create policy "Athletes can read own coaching adjustments"
on public.exercise_coaching_adjustments for select
to authenticated
using (athlete_user_id = auth.uid());

create policy "Athletes can accept own coaching adjustments"
on public.exercise_coaching_adjustments for insert
to authenticated
with check (
  athlete_user_id = auth.uid()
  and exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_id
      and ws.athlete_user_id = auth.uid()
      and ws.status = 'in_progress'
  )
  and exists (
    select 1
    from public.exercise_sessions es
    where es.id = exercise_session_id
      and es.workout_session_id = workout_session_id
      and es.exercise_id = exercise_coaching_adjustments.exercise_id
  )
);

create policy "Athletes can update own coaching adjustments"
on public.exercise_coaching_adjustments for update
to authenticated
using (athlete_user_id = auth.uid())
with check (athlete_user_id = auth.uid());

create index if not exists exercise_coaching_adjustments_session_idx
on public.exercise_coaching_adjustments (workout_session_id, athlete_user_id);

create index if not exists exercise_coaching_adjustments_exercise_idx
on public.exercise_coaching_adjustments (exercise_id, athlete_user_id, accepted_at desc);
