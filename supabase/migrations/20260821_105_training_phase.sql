alter table public.athlete_profiles
add column if not exists training_phase text not null default 'maintenance'
check (training_phase in ('maintenance','cut'));

comment on column public.athlete_profiles.training_phase is
'Current athlete training phase used by PHATBOT for phase-aware coaching and, after separate scoring validation, phase-aware performance interpretation.';
