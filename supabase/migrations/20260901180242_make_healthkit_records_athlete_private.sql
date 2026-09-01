-- HealthKit-derived records are private to the athlete in V1. This replaces
-- coach-aware SELECT policies without changing any existing rows.

begin;

drop policy if exists health_daily_metrics_read on public.health_daily_metrics;

create policy health_daily_metrics_read on public.health_daily_metrics
for select
to authenticated
using ((select auth.uid()) = athlete_user_id);

drop policy if exists cardio_activities_read on public.cardio_activities;

create policy cardio_activities_read on public.cardio_activities
for select
to authenticated
using ((select auth.uid()) = athlete_user_id);

commit;
