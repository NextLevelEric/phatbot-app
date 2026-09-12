create table public.bodyweight_measurements (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  weight_value numeric(6,2) not null,
  unit text not null check (unit in ('lb', 'kg')),
  weight_kg numeric(7,3) generated always as (
    case
      when unit = 'kg' then weight_value
      else weight_value * 0.45359237
    end
  ) stored,
  measured_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'apple_health', 'health_connect')),
  created_at timestamptz not null default now(),
  constraint bodyweight_measurements_reasonable_value check (
    (unit = 'lb' and weight_value between 40 and 1000)
    or (unit = 'kg' and weight_value between 18 and 454)
  )
);

create index bodyweight_measurements_athlete_latest_idx
  on public.bodyweight_measurements (athlete_user_id, measured_at desc, created_at desc);

alter table public.bodyweight_measurements enable row level security;

revoke all on table public.bodyweight_measurements from anon, authenticated;
grant select, insert on table public.bodyweight_measurements to authenticated;
grant all on table public.bodyweight_measurements to service_role;

create policy bodyweight_measurements_select_own
on public.bodyweight_measurements
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = athlete_user_id);

create policy bodyweight_measurements_insert_own
on public.bodyweight_measurements
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = athlete_user_id);

comment on table public.bodyweight_measurements is
  'Append-only athlete-owned bodyweight history. Multiple intentional measurements per day are preserved.';
comment on column public.bodyweight_measurements.weight_value is
  'Original athlete-entered measurement in the accompanying unit.';
comment on column public.bodyweight_measurements.weight_kg is
  'Canonical generated kilograms for future longitudinal analysis; never replaces the original entry.';
