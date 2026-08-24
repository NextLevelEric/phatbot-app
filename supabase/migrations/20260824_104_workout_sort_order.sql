alter table public.workouts
  add column if not exists sort_order integer not null default 9999;

create index if not exists workouts_athlete_sort_idx
  on public.workouts (athlete_user_id, is_active desc, sort_order asc, created_at asc);
