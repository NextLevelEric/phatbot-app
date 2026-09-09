-- Safely map exact normalized-name duplicates to one identity.
-- This changes identity mapping only; no workout history or exercise rows are deleted.

with ranked as (
  select
    id,
    lower(coalesce(normalized_name, name)) as identity_key,
    first_value(id) over (
      partition by lower(coalesce(normalized_name, name))
      order by created_at asc, id asc
    ) as canonical_id,
    count(*) over (
      partition by lower(coalesce(normalized_name, name))
    ) as identity_count
  from public.exercises
), duplicate_map as (
  select id, canonical_id
  from ranked
  where identity_count > 1
)
update public.exercises e
set canonical_exercise_id = d.canonical_id
from duplicate_map d
where e.id = d.id
  and e.canonical_exercise_id is distinct from d.canonical_id;
