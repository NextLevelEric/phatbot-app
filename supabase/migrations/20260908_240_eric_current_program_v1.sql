-- Eric / The Smooth Bear published-program foundation.
-- Production migration applied via Supabase as eric_current_program_v1.
-- The published Meso 1 is sourced from the uploaded six-day workbook and
-- intentionally creates athlete-owned workout copies on enrollment so future
-- program publishing never mutates an athlete's history.

create table if not exists public.training_programs (
  id uuid primary key default gen_random_uuid(), coach_user_id uuid not null references public.coach_profiles(user_id),
  name text not null, slug text not null unique, description text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  version integer not null default 1, published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.training_program_days (
  id uuid primary key default gen_random_uuid(), program_id uuid not null references public.training_programs(id) on delete cascade,
  day_number integer not null check(day_number>0), name text not null, unique(program_id,day_number)
);
create table if not exists public.training_program_exercises (
  id uuid primary key default gen_random_uuid(), program_day_id uuid not null references public.training_program_days(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id), position integer not null check(position>0),
  prescribed_set_targets text[] not null default '{}', notes text, unique(program_day_id,position)
);
create table if not exists public.athlete_program_enrollments (
  id uuid primary key default gen_random_uuid(), athlete_user_id uuid not null references public.athlete_profiles(user_id),
  program_id uuid not null references public.training_programs(id), status text not null default 'active' check(status in ('active','completed','left')),
  enrolled_at timestamptz not null default now(), ended_at timestamptz, unique(athlete_user_id,program_id)
);
create table if not exists public.athlete_program_workouts (
  enrollment_id uuid not null references public.athlete_program_enrollments(id) on delete cascade,
  program_day_id uuid not null references public.training_program_days(id), workout_id uuid not null references public.workouts(id),
  primary key(enrollment_id,program_day_id), unique(workout_id)
);

alter table public.training_programs enable row level security;
alter table public.training_program_days enable row level security;
alter table public.training_program_exercises enable row level security;
alter table public.athlete_program_enrollments enable row level security;
alter table public.athlete_program_workouts enable row level security;

create policy "published programs readable" on public.training_programs for select to authenticated using(status='published' or coach_user_id=auth.uid());
create policy "published program days readable" on public.training_program_days for select to authenticated using(exists(select 1 from public.training_programs p where p.id=program_id and (p.status='published' or p.coach_user_id=auth.uid())));
create policy "published program exercises readable" on public.training_program_exercises for select to authenticated using(exists(select 1 from public.training_program_days d join public.training_programs p on p.id=d.program_id where d.id=program_day_id and (p.status='published' or p.coach_user_id=auth.uid())));
create policy "athletes read own program enrollments" on public.athlete_program_enrollments for select to authenticated using(athlete_user_id=auth.uid());
create policy "athletes read own program workouts" on public.athlete_program_workouts for select to authenticated using(exists(select 1 from public.athlete_program_enrollments e where e.id=enrollment_id and e.athlete_user_id=auth.uid()));

-- Seed data and RPC bodies are kept in the applied Supabase migration. The seed
-- resolves the canonical coach through dashboard_enabled and resolves exercises
-- by normalized name rather than hard-coding generated database IDs.
