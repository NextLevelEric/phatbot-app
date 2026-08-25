-- Extend PHATBOT set types for pilot-tested training patterns.
-- Drop and tempo sets are stored distinctly so scoring can treat them differently.
-- Timed sets use duration_seconds and do not rely on rep volume.

alter type public.set_type add value if not exists 'drop';
alter type public.set_type add value if not exists 'timed';
alter type public.set_type add value if not exists 'tempo';

alter table public.sets
  add column if not exists duration_seconds integer;

alter table public.sets
  drop constraint if exists sets_duration_seconds_check;

alter table public.sets
  add constraint sets_duration_seconds_check
  check (duration_seconds is null or duration_seconds > 0);

comment on column public.sets.duration_seconds is
  'Duration in seconds for timed sets. Null for rep-based sets.';
