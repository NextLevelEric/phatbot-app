-- Persist normalized Apple Health / HealthKit data for athlete trends and cardio analysis.

create table public.health_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  metric_date date not null,
  steps integer check (steps is null or steps >= 0),
  active_energy_kcal numeric(10,2) check (active_energy_kcal is null or active_energy_kcal >= 0),
  resting_heart_rate_bpm numeric(8,2) check (resting_heart_rate_bpm is null or resting_heart_rate_bpm > 0),
  hrv_ms numeric(10,2) check (hrv_ms is null or hrv_ms >= 0),
  sleep_seconds integer check (sleep_seconds is null or sleep_seconds >= 0),
  source text not null default 'healthkit',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_user_id, metric_date, source)
);

create table public.cardio_activities (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  source text not null default 'healthkit',
  source_workout_id text not null,
  activity_type integer not null,
  activity_name text,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds numeric(12,2) not null check (duration_seconds >= 0),
  distance_meters numeric(12,2) check (distance_meters is null or distance_meters >= 0),
  active_energy_kcal numeric(10,2) check (active_energy_kcal is null or active_energy_kcal >= 0),
  average_heart_rate_bpm numeric(8,2) check (average_heart_rate_bpm is null or average_heart_rate_bpm > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_user_id, source, source_workout_id),
  check (ended_at >= started_at)
);

create index health_daily_metrics_athlete_date_idx
  on public.health_daily_metrics (athlete_user_id, metric_date desc);

create index cardio_activities_athlete_started_idx
  on public.cardio_activities (athlete_user_id, started_at desc);

create index cardio_activities_athlete_type_started_idx
  on public.cardio_activities (athlete_user_id, activity_type, started_at desc);

create trigger health_daily_metrics_set_updated_at before update on public.health_daily_metrics
for each row execute function public.set_updated_at();

create trigger cardio_activities_set_updated_at before update on public.cardio_activities
for each row execute function public.set_updated_at();

alter table public.health_daily_metrics enable row level security;
alter table public.cardio_activities enable row level security;

create policy health_daily_metrics_read on public.health_daily_metrics
for select using (public.can_access_athlete(athlete_user_id));

create policy health_daily_metrics_insert_own on public.health_daily_metrics
for insert with check (athlete_user_id = auth.uid());

create policy health_daily_metrics_update_own on public.health_daily_metrics
for update using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());

create policy health_daily_metrics_delete_own on public.health_daily_metrics
for delete using (athlete_user_id = auth.uid());

create policy cardio_activities_read on public.cardio_activities
for select using (public.can_access_athlete(athlete_user_id));

create policy cardio_activities_insert_own on public.cardio_activities
for insert with check (athlete_user_id = auth.uid());

create policy cardio_activities_update_own on public.cardio_activities
for update using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());

create policy cardio_activities_delete_own on public.cardio_activities
for delete using (athlete_user_id = auth.uid());
