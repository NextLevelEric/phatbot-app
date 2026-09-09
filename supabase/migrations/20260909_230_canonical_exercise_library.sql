-- PHATBOT canonical exercise identity layer.
-- Preserve historical exercise IDs; map them to stable canonical identities instead of destructive renames/deletes.

alter table public.exercises
  add column if not exists canonical_exercise_id uuid references public.exercises(id) on delete set null,
  add column if not exists is_standard boolean not null default false,
  add column if not exists is_custom boolean not null default false;

create index if not exists exercises_canonical_exercise_id_idx
  on public.exercises(canonical_exercise_id);

create unique index if not exists exercises_unique_standard_normalized_name_idx
  on public.exercises(lower(normalized_name))
  where is_standard = true and normalized_name is not null;

comment on column public.exercises.canonical_exercise_id is
  'Stable PHATBOT exercise identity. Historical/custom aliases point to the canonical exercise row; canonical rows point to themselves.';
comment on column public.exercises.is_standard is
  'True only for exercises approved for the PHATBOT Standard Exercise Library.';
comment on column public.exercises.is_custom is
  'True for athlete-created/nonstandard exercises that remain valid but are not part of the coach-controlled standard library.';

-- Existing rows initially remain their own identities. We intentionally do not merge history automatically.
update public.exercises
set canonical_exercise_id = id
where canonical_exercise_id is null;

create or replace view public.exercise_identity as
select
  e.id as exercise_id,
  e.name as recorded_name,
  e.normalized_name,
  e.canonical_exercise_id,
  coalesce(c.name, e.name) as canonical_name,
  coalesce(c.muscle_group, e.muscle_group) as canonical_muscle_group,
  coalesce(c.equipment, e.equipment) as canonical_equipment,
  coalesce(c.is_standard, e.is_standard) as is_standard,
  e.is_custom
from public.exercises e
left join public.exercises c on c.id = e.canonical_exercise_id;

grant select on public.exercise_identity to authenticated;
