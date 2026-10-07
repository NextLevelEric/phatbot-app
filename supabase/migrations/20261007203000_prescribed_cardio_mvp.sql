-- Prescribed Cardio MVP
create table if not exists public.athlete_cardio_prescriptions (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  activity_kind text not null check (activity_kind in ('run','walk','bike')),
  weekday smallint not null check (weekday between 0 and 6),
  title text not null,
  minimum_distance_meters numeric check (minimum_distance_meters is null or minimum_distance_meters > 0),
  minimum_duration_seconds integer check (minimum_duration_seconds is null or minimum_duration_seconds > 0),
  optional_extra boolean not null default false,
  notes text,
  is_active boolean not null default true,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_cardio_prescription_target check (minimum_distance_meters is not null or minimum_duration_seconds is not null),
  constraint athlete_cardio_prescription_dates check (ends_on is null or ends_on >= starts_on)
);
create unique index if not exists athlete_cardio_prescriptions_active_slot on public.athlete_cardio_prescriptions (athlete_user_id, weekday, activity_kind) where is_active;
alter table public.athlete_cardio_prescriptions enable row level security;
drop policy if exists "athletes read own cardio prescriptions" on public.athlete_cardio_prescriptions;
create policy "athletes read own cardio prescriptions" on public.athlete_cardio_prescriptions for select to authenticated using ((select auth.uid()) = athlete_user_id);
revoke all on table public.athlete_cardio_prescriptions from anon;
grant select on table public.athlete_cardio_prescriptions to authenticated;

-- Eric-only pilot, intentionally independent of the strength rotation cursor.
insert into public.athlete_cardio_prescriptions (athlete_user_id,activity_kind,weekday,title,minimum_distance_meters,optional_extra,notes,starts_on)
select id,'run',3,'Wednesday Short Run',1609.344,true,'Run at least 1 mile. Keep going if you are feeling good.',date '2026-10-07'
from public.profiles where id='d8bfdf85-d317-423f-baaa-9cdc02566c7e'
on conflict (athlete_user_id,weekday,activity_kind) where is_active do nothing;
insert into public.athlete_cardio_prescriptions (athlete_user_id,activity_kind,weekday,title,minimum_distance_meters,optional_extra,notes,starts_on)
select id,'run',0,'Sunday Long Run',5000,true,'Run at least 5K. Keep going if you are feeling good.',date '2026-10-07'
from public.profiles where id='d8bfdf85-d317-423f-baaa-9cdc02566c7e'
on conflict (athlete_user_id,weekday,activity_kind) where is_active do nothing;
