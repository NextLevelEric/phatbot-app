create table if not exists public.health_nutrition_daily (
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('healthkit','health_connect','partner')),
  nutrition_date date not null,
  energy_kcal numeric,
  protein_g numeric,
  carbohydrate_g numeric,
  fat_g numeric,
  source_origins text[] not null default '{}',
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_user_id, source, nutrition_date),
  check (energy_kcal is null or energy_kcal >= 0),
  check (protein_g is null or protein_g >= 0),
  check (carbohydrate_g is null or carbohydrate_g >= 0),
  check (fat_g is null or fat_g >= 0)
);

alter table public.health_nutrition_daily enable row level security;

create policy "athletes manage own nutrition observations"
on public.health_nutrition_daily
for all to authenticated
using (athlete_user_id = auth.uid())
with check (athlete_user_id = auth.uid());

create index if not exists health_nutrition_daily_athlete_date_idx
on public.health_nutrition_daily (athlete_user_id, nutrition_date desc);

comment on table public.health_nutrition_daily is
'Source-aware daily nutrition observations imported from authorized health stores or partners. Null means unavailable; never infer missing macros from calories.';
