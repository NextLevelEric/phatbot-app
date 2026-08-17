-- PHATBOT initial schema
-- Supabase Auth (auth.users) is the canonical Users table.
-- public.profiles extends auth.users with app-facing identity data.

create extension if not exists pgcrypto;

create type public.app_role as enum ('athlete', 'coach', 'admin');
create type public.workout_session_status as enum ('in_progress', 'completed', 'cancelled');
create type public.set_type as enum ('working', 'top', 'backoff', 'warmup');
create type public.score_result as enum ('progression', 'neutral', 'regression', 'baseline');
create type public.pr_type as enum ('heaviest_weight', 'matched_load_reps');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.app_role not null default 'athlete',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.athlete_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_unit text not null default 'lb' check (preferred_unit in ('lb', 'kg')),
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  business_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_athletes (
  coach_user_id uuid not null references public.coach_profiles(user_id) on delete cascade,
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (coach_user_id, athlete_user_id),
  check (coach_user_id <> athlete_user_id)
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (lower(trim(name))) stored,
  muscle_group text,
  equipment text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index exercises_system_name_unique
  on public.exercises (normalized_name)
  where created_by is null;

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position integer not null check (position > 0),
  target_rep_min integer check (target_rep_min is null or target_rep_min > 0),
  target_rep_max integer check (target_rep_max is null or target_rep_max > 0),
  minimum_progression_reps integer check (minimum_progression_reps is null or minimum_progression_reps > 0),
  scoring_weight numeric(6,3) not null default 1.000 check (scoring_weight > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_id, position),
  check (target_rep_min is null or target_rep_max is null or target_rep_min <= target_rep_max)
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  workout_name_snapshot text not null,
  status public.workout_session_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  )
);

create table public.exercise_sessions (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  workout_exercise_id uuid references public.workout_exercises(id) on delete set null,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  exercise_name_snapshot text not null,
  position integer not null check (position > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_session_id, position)
);

create table public.sets (
  id uuid primary key default gen_random_uuid(),
  exercise_session_id uuid not null references public.exercise_sessions(id) on delete cascade,
  set_number integer not null check (set_number > 0),
  set_type public.set_type not null default 'working',
  weight numeric(8,2) not null check (weight >= 0),
  reps integer not null check (reps >= 0),
  partial_reps integer not null default 0 check (partial_reps >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exercise_session_id, set_number)
);

create table public.exercise_scores (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_session_id uuid not null unique references public.exercise_sessions(id) on delete cascade,
  comparison_exercise_session_id uuid references public.exercise_sessions(id) on delete set null,
  result public.score_result not null,
  score numeric(4,3) not null check (score in (0, 0.5, 1)),
  scoring_weight numeric(6,3) not null default 1.000 check (scoring_weight > 0),
  explanation_code text,
  created_at timestamptz not null default now()
);

create table public.workout_scores (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  workout_session_id uuid not null unique references public.workout_sessions(id) on delete cascade,
  score numeric(6,3) not null check (score >= 0 and score <= 1),
  scored_exercise_count integer not null default 0 check (scored_exercise_count >= 0),
  progression_count integer not null default 0 check (progression_count >= 0),
  neutral_count integer not null default 0 check (neutral_count >= 0),
  regression_count integer not null default 0 check (regression_count >= 0),
  baseline_count integer not null default 0 check (baseline_count >= 0),
  created_at timestamptz not null default now()
);

create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  exercise_session_id uuid not null references public.exercise_sessions(id) on delete cascade,
  set_id uuid references public.sets(id) on delete set null,
  pr_type public.pr_type not null,
  weight numeric(8,2) not null check (weight >= 0),
  reps integer not null check (reps >= 0),
  previous_weight numeric(8,2),
  previous_reps integer,
  achieved_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.weekly_scores (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  week_start date not null,
  week_end date not null,
  score numeric(6,3) check (score is null or (score >= 0 and score <= 1)),
  completed_workout_count integer not null default 0 check (completed_workout_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_user_id, week_start),
  check (week_end >= week_start)
);

-- Indexes optimized for PHATBOT's most important history/comparison lookups.
create index workout_sessions_athlete_completed_idx
  on public.workout_sessions (athlete_user_id, completed_at desc)
  where status = 'completed';

create index exercise_sessions_history_idx
  on public.exercise_sessions (exercise_id, workout_session_id);

create index sets_exercise_session_idx
  on public.sets (exercise_session_id, set_number);

create index exercise_scores_athlete_session_idx
  on public.exercise_scores (athlete_user_id, workout_session_id);

create index personal_records_athlete_exercise_date_idx
  on public.personal_records (athlete_user_id, exercise_id, achieved_at desc);

create index weekly_scores_athlete_week_idx
  on public.weekly_scores (athlete_user_id, week_start desc);

-- Maintain updated_at automatically.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger athlete_profiles_set_updated_at before update on public.athlete_profiles
for each row execute function public.set_updated_at();
create trigger coach_profiles_set_updated_at before update on public.coach_profiles
for each row execute function public.set_updated_at();
create trigger exercises_set_updated_at before update on public.exercises
for each row execute function public.set_updated_at();
create trigger workouts_set_updated_at before update on public.workouts
for each row execute function public.set_updated_at();
create trigger workout_exercises_set_updated_at before update on public.workout_exercises
for each row execute function public.set_updated_at();
create trigger workout_sessions_set_updated_at before update on public.workout_sessions
for each row execute function public.set_updated_at();
create trigger exercise_sessions_set_updated_at before update on public.exercise_sessions
for each row execute function public.set_updated_at();
create trigger sets_set_updated_at before update on public.sets
for each row execute function public.set_updated_at();
create trigger weekly_scores_set_updated_at before update on public.weekly_scores
for each row execute function public.set_updated_at();

-- Automatically create a public profile + athlete profile for new signups.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'athlete'
  );

  insert into public.athlete_profiles (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Access helper. Athlete always has access to self; linked active coach can access athlete data.
create or replace function public.can_access_athlete(target_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = target_athlete
    or exists (
      select 1
      from public.coach_athletes ca
      where ca.athlete_user_id = target_athlete
        and ca.coach_user_id = auth.uid()
        and ca.active = true
    );
$$;

-- Row Level Security.
alter table public.profiles enable row level security;
alter table public.athlete_profiles enable row level security;
alter table public.coach_profiles enable row level security;
alter table public.coach_athletes enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.exercise_sessions enable row level security;
alter table public.sets enable row level security;
alter table public.exercise_scores enable row level security;
alter table public.workout_scores enable row level security;
alter table public.personal_records enable row level security;
alter table public.weekly_scores enable row level security;

create policy profiles_read_own on public.profiles
for select using (id = auth.uid());
create policy profiles_update_own on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy athlete_profiles_access on public.athlete_profiles
for select using (public.can_access_athlete(user_id));
create policy athlete_profiles_update_own on public.athlete_profiles
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy coach_profiles_read_own on public.coach_profiles
for select using (user_id = auth.uid());
create policy coach_profiles_update_own on public.coach_profiles
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy coach_athletes_read_participant on public.coach_athletes
for select using (coach_user_id = auth.uid() or athlete_user_id = auth.uid());

create policy exercises_read_available on public.exercises
for select using (is_active = true and (created_by is null or created_by = auth.uid()));
create policy exercises_insert_own on public.exercises
for insert with check (created_by = auth.uid());
create policy exercises_update_own on public.exercises
for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy workouts_access on public.workouts
for all using (public.can_access_athlete(athlete_user_id))
with check (public.can_access_athlete(athlete_user_id));

create policy workout_exercises_access on public.workout_exercises
for all using (
  exists (
    select 1 from public.workouts w
    where w.id = workout_id and public.can_access_athlete(w.athlete_user_id)
  )
)
with check (
  exists (
    select 1 from public.workouts w
    where w.id = workout_id and public.can_access_athlete(w.athlete_user_id)
  )
);

create policy workout_sessions_access on public.workout_sessions
for all using (public.can_access_athlete(athlete_user_id))
with check (public.can_access_athlete(athlete_user_id));

create policy exercise_sessions_access on public.exercise_sessions
for all using (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id = workout_session_id and public.can_access_athlete(ws.athlete_user_id)
  )
)
with check (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id = workout_session_id and public.can_access_athlete(ws.athlete_user_id)
  )
);

create policy sets_access on public.sets
for all using (
  exists (
    select 1
    from public.exercise_sessions es
    join public.workout_sessions ws on ws.id = es.workout_session_id
    where es.id = exercise_session_id and public.can_access_athlete(ws.athlete_user_id)
  )
)
with check (
  exists (
    select 1
    from public.exercise_sessions es
    join public.workout_sessions ws on ws.id = es.workout_session_id
    where es.id = exercise_session_id and public.can_access_athlete(ws.athlete_user_id)
  )
);

create policy exercise_scores_access on public.exercise_scores
for all using (public.can_access_athlete(athlete_user_id))
with check (public.can_access_athlete(athlete_user_id));

create policy workout_scores_access on public.workout_scores
for all using (public.can_access_athlete(athlete_user_id))
with check (public.can_access_athlete(athlete_user_id));

create policy personal_records_access on public.personal_records
for all using (public.can_access_athlete(athlete_user_id))
with check (public.can_access_athlete(athlete_user_id));

create policy weekly_scores_access on public.weekly_scores
for all using (public.can_access_athlete(athlete_user_id))
with check (public.can_access_athlete(athlete_user_id));

comment on table public.workout_sessions is 'Immutable historical workout record once completed; correction workflow should be explicit rather than overwriting history.';
comment on table public.exercise_scores is 'Deterministic progressive-overload result for one exercise session, including the exact prior exercise session used for comparison.';
comment on table public.personal_records is 'Historical PR event log. Do not overwrite old PR rows when a new PR is achieved.';
