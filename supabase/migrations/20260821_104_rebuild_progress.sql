create table if not exists public.exercise_rebuild_progress (
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null,
  exercise_name text not null,
  coaching_adjustment_id uuid not null references public.exercise_coaching_adjustments(id) on delete cascade,
  rebuild_workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  rebuild_started_at timestamptz not null,
  pre_rebuild_strength numeric,
  rebuild_baseline_strength numeric,
  latest_strength numeric,
  progress_from_rebuild_percent numeric,
  recovery_to_pre_rebuild_percent numeric,
  stage text not null default 'rebuild_started' check (stage in ('rebuild_started','baseline_established','rebuilding_progress','plateau_cleared')),
  post_rebuild_sessions integer not null default 0,
  updated_at timestamptz not null default now(),
  cleared_at timestamptz,
  primary key (athlete_user_id, exercise_id)
);

alter table public.exercise_rebuild_progress enable row level security;

create policy "Athletes can read own rebuild progress"
on public.exercise_rebuild_progress for select
to authenticated
using (athlete_user_id = auth.uid());

create policy "Athletes can insert own rebuild progress"
on public.exercise_rebuild_progress for insert
to authenticated
with check (athlete_user_id = auth.uid());

create policy "Athletes can update own rebuild progress"
on public.exercise_rebuild_progress for update
to authenticated
using (athlete_user_id = auth.uid())
with check (athlete_user_id = auth.uid());

create index if not exists exercise_rebuild_progress_stage_idx
on public.exercise_rebuild_progress (athlete_user_id, stage, updated_at desc);
