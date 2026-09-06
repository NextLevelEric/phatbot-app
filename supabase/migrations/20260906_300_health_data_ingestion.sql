create table if not exists public.athlete_health_connections (
  athlete_user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('apple_health','health_connect')),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_health_daily_metrics (
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('apple_health','health_connect')),
  metric_date date not null,
  steps bigint,
  active_energy_kcal numeric,
  resting_heart_rate_bpm numeric,
  hrv_ms numeric,
  weight_kg numeric,
  updated_at timestamptz not null default now(),
  primary key (athlete_user_id, provider, metric_date)
);

create table if not exists public.athlete_health_workouts (
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('apple_health','health_connect')),
  source_workout_id text not null,
  activity_type integer,
  activity_name text,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds numeric not null,
  distance_meters numeric,
  active_energy_kcal numeric,
  average_heart_rate_bpm numeric,
  updated_at timestamptz not null default now(),
  primary key (athlete_user_id, provider, source_workout_id)
);

create table if not exists public.athlete_health_sleep_sessions (
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('apple_health','health_connect')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds numeric not null,
  source_value numeric,
  updated_at timestamptz not null default now(),
  primary key (athlete_user_id, provider, started_at, ended_at)
);

alter table public.athlete_health_connections enable row level security;
alter table public.athlete_health_daily_metrics enable row level security;
alter table public.athlete_health_workouts enable row level security;
alter table public.athlete_health_sleep_sessions enable row level security;

create policy "athletes manage own health connection" on public.athlete_health_connections
for all to authenticated using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());
create policy "athletes manage own health daily metrics" on public.athlete_health_daily_metrics
for all to authenticated using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());
create policy "athletes manage own health workouts" on public.athlete_health_workouts
for all to authenticated using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());
create policy "athletes manage own health sleep" on public.athlete_health_sleep_sessions
for all to authenticated using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());
