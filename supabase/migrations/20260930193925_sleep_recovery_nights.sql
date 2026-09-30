-- Pending review only. No legacy totals are backfilled or relabelled as verified.
create table public.health_sleep_nights (
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('healthkit','health_connect')),
  wake_date date not null,
  time_zone text not null check (length(time_zone) between 1 and 100),
  sleep_start timestamptz,
  wake_time timestamptz,
  interval_start timestamptz not null,
  interval_end timestamptz not null check (interval_end > interval_start),
  asleep_seconds integer check (asleep_seconds >= 0),
  in_bed_seconds integer check (in_bed_seconds >= 0),
  awake_seconds integer check (awake_seconds >= 0),
  stages jsonb not null default '{}' check (jsonb_typeof(stages) = 'object'),
  quality_flags text[] not null default '{}',
  raw_samples jsonb not null check (jsonb_typeof(raw_samples) = 'array'),
  additional_sleep_seconds integer not null default 0 check (additional_sleep_seconds >= 0),
  method_version integer not null check (method_version = 1),
  observed_at timestamptz not null,
  window_start timestamptz not null,
  window_end timestamptz not null check (window_end > window_start),
  primary key (athlete_user_id, source, wake_date),
  check ((sleep_start is null and wake_time is null) or (sleep_start is not null and wake_time is not null and wake_time > sleep_start)),
  check (sleep_start is null or (sleep_start >= interval_start and wake_time <= interval_end))
);
comment on table public.health_sleep_nights is 'Versioned interval-derived main sleep episodes. Provider provenance and raw categories retained. Timezone is the sync-device timezone, not historical travel evidence. No legacy-total backfill.';
alter table public.health_sleep_nights enable row level security;
revoke all on public.health_sleep_nights from anon, authenticated;
grant select, insert, update on public.health_sleep_nights to authenticated;
create policy sleep_nights_read_own on public.health_sleep_nights for select to authenticated using ((select auth.uid()) = athlete_user_id);
create policy sleep_nights_insert_own on public.health_sleep_nights for insert to authenticated with check ((select auth.uid()) = athlete_user_id);
create policy sleep_nights_update_own on public.health_sleep_nights for update to authenticated using ((select auth.uid()) = athlete_user_id) with check ((select auth.uid()) = athlete_user_id);
