-- Add stable coach-controlled ordering for athlete workout templates.
-- Archived workouts remain in the database and keep all historical sessions/results.

alter table public.workouts
  add column if not exists sort_order integer;

with ranked as (
  select id,
         row_number() over (
           partition by athlete_user_id
           order by created_at asc, id asc
         ) as rn
  from public.workouts
)
update public.workouts w
set sort_order = ranked.rn
from ranked
where ranked.id = w.id
  and w.sort_order is null;

alter table public.workouts
  alter column sort_order set default 1;

create index if not exists workouts_athlete_sort_order_idx
  on public.workouts (athlete_user_id, is_active desc, sort_order asc, created_at asc);
