create table if not exists public.exercise_plateau_signals (
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null,
  exercise_name text not null,
  detected_at timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  consecutive_flat_sessions integer not null default 3,
  baseline_strength numeric,
  recent_strength numeric,
  change_percent numeric,
  status text not null default 'active' check (status in ('active','resolved')),
  resolved_at timestamptz,
  primary key (athlete_user_id, exercise_id)
);

alter table public.exercise_plateau_signals enable row level security;

create policy "Athletes can read own plateau signals"
on public.exercise_plateau_signals for select
to authenticated
using (athlete_user_id = auth.uid());

create policy "Athletes can insert own plateau signals"
on public.exercise_plateau_signals for insert
to authenticated
with check (athlete_user_id = auth.uid());

create policy "Athletes can update own plateau signals"
on public.exercise_plateau_signals for update
to authenticated
using (athlete_user_id = auth.uid())
with check (athlete_user_id = auth.uid());

create index if not exists exercise_plateau_signals_active_idx
on public.exercise_plateau_signals (athlete_user_id, status, last_evaluated_at desc);
