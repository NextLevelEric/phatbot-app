-- Distinguish QA/development workout sessions from real athlete training.
-- Test sessions remain in the database for debugging and scoring QA, but
-- athlete-facing intelligence can exclude them from progress/history signals.

alter table public.workout_sessions
  add column if not exists is_test boolean not null default false;

create index if not exists workout_sessions_athlete_real_completed_idx
  on public.workout_sessions (athlete_user_id, completed_at desc)
  where status = 'completed' and is_test = false;

comment on column public.workout_sessions.is_test is
  'True for QA/development sessions that should be excluded from athlete training intelligence.';
