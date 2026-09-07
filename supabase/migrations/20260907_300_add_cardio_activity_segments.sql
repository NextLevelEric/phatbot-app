create table if not exists public.cardio_activity_segments (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  cardio_activity_id uuid not null references public.cardio_activities(id) on delete cascade,
  segment_key text not null,
  segment_label text not null,
  distance_meters numeric not null check (distance_meters > 0),
  duration_seconds numeric not null check (duration_seconds > 0),
  start_offset_seconds numeric not null default 0 check (start_offset_seconds >= 0),
  end_offset_seconds numeric not null check (end_offset_seconds > 0),
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cardio_activity_id, segment_key)
);

alter table public.cardio_activity_segments enable row level security;

drop policy if exists "athletes_select_own_cardio_segments" on public.cardio_activity_segments;
create policy "athletes_select_own_cardio_segments" on public.cardio_activity_segments for select using (auth.uid() = athlete_user_id);

drop policy if exists "athletes_insert_own_cardio_segments" on public.cardio_activity_segments;
create policy "athletes_insert_own_cardio_segments" on public.cardio_activity_segments for insert with check (auth.uid() = athlete_user_id);

drop policy if exists "athletes_update_own_cardio_segments" on public.cardio_activity_segments;
create policy "athletes_update_own_cardio_segments" on public.cardio_activity_segments for update using (auth.uid() = athlete_user_id) with check (auth.uid() = athlete_user_id);

drop policy if exists "athletes_delete_own_cardio_segments" on public.cardio_activity_segments;
create policy "athletes_delete_own_cardio_segments" on public.cardio_activity_segments for delete using (auth.uid() = athlete_user_id);

create index if not exists cardio_activity_segments_athlete_key_idx on public.cardio_activity_segments(athlete_user_id, segment_key, duration_seconds);
