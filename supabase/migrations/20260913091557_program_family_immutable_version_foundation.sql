-- Program family + immutable program-version foundation.
--
-- This migration deliberately leaves athlete enrollment/materialization behavior
-- unchanged. Published definitions are immutable by default for every role.
-- A reviewed administrative repair must run as postgres/service_role/
-- supabase_admin and explicitly opt in for its transaction with:
--   set local phatbot.allow_published_program_repair = 'on';

create table public.program_families (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  source_type text not null check (source_type in ('phatbot_stock', 'coach', 'athlete', 'athlete_fork')),
  owner_user_id uuid references public.profiles(id) on delete set null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  visibility text not null default 'private' check (visibility in ('stock_catalog', 'private', 'coach_library')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.program_families is
  'Stable program identity across immutable training_programs version rows.';
comment on column public.program_families.source_type is
  'Explicit provenance: PHATBOT stock, coach-created, athlete-created, or athlete-specific fork.';

create index program_families_owner_user_id_idx
  on public.program_families (owner_user_id)
  where owner_user_id is not null;
create index program_families_created_by_user_id_idx
  on public.program_families (created_by_user_id)
  where created_by_user_id is not null;
create index program_families_source_type_idx
  on public.program_families (source_type);

create trigger program_families_set_updated_at
before update on public.program_families
for each row execute function public.set_updated_at();

alter table public.training_programs
  rename column version to version_number;

alter table public.training_programs
  add column program_family_id uuid references public.program_families(id) on delete restrict,
  add column authored_by_user_id uuid references public.profiles(id) on delete set null,
  add column published_by_user_id uuid references public.profiles(id) on delete set null,
  add column derived_from_program_version_id uuid references public.training_programs(id) on delete restrict,
  add column customized_for_athlete_user_id uuid references public.athlete_profiles(user_id) on delete set null,
  add column sequence_mode text not null default 'rotation';

alter table public.training_programs
  alter column coach_user_id drop not null;

alter table public.training_programs
  drop constraint training_programs_status_check;

update public.training_programs
set status = 'retired',
    published_at = coalesce(published_at, created_at)
where status = 'archived';

alter table public.training_programs
  add constraint training_programs_status_check
    check (status in ('draft', 'published', 'retired')),
  add constraint training_programs_version_number_positive
    check (version_number > 0),
  add constraint training_programs_sequence_mode_check
    check (sequence_mode in ('rotation')),
  add constraint training_programs_published_timestamp_check
    check (status = 'draft' or published_at is not null),
  add constraint training_programs_derived_version_not_self
    check (derived_from_program_version_id is null or derived_from_program_version_id <> id);

-- Production has exactly this one legacy published program. Fail safely if an
-- unexpected legacy program appears before rollout instead of inventing its
-- family/provenance during the migration.
do $$
begin
  if exists (
    select 1
    from public.training_programs
    where program_family_id is null
      and slug <> 'smooth-bear-current-meso-1'
  ) then
    raise exception 'Unreviewed legacy training program requires an explicit family backfill';
  end if;
end
$$;

insert into public.program_families (
  slug,
  name,
  source_type,
  owner_user_id,
  created_by_user_id,
  visibility,
  status,
  created_at,
  updated_at
)
select
  'smooth-bear-current',
  'The Smooth Bear''s Current Program',
  'phatbot_stock',
  p.coach_user_id,
  p.coach_user_id,
  'stock_catalog',
  'active',
  p.created_at,
  p.updated_at
from public.training_programs p
where p.slug = 'smooth-bear-current-meso-1'
on conflict (slug) do nothing;

update public.training_programs p
set program_family_id = f.id,
    authored_by_user_id = coalesce(p.authored_by_user_id, p.coach_user_id),
    published_by_user_id = case
      when p.status in ('published', 'retired')
        then coalesce(p.published_by_user_id, p.coach_user_id)
      else p.published_by_user_id
    end
from public.program_families f
where p.slug = 'smooth-bear-current-meso-1'
  and f.slug = 'smooth-bear-current';

alter table public.training_programs
  alter column program_family_id set not null,
  add constraint training_programs_family_version_unique
    unique (program_family_id, version_number);

comment on table public.training_programs is
  'Immutable-on-publication program versions. New program editions require a new row and version_number.';
comment on column public.training_programs.slug is
  'Legacy version-level lookup key retained for compatibility; program_families.slug is the durable product identity.';
comment on column public.training_programs.sequence_mode is
  'Declared sequencing model only. Slice 1 supports rotation but does not implement athlete sequence state.';

create index training_programs_authored_by_user_id_idx
  on public.training_programs (authored_by_user_id)
  where authored_by_user_id is not null;
create index training_programs_derived_from_version_idx
  on public.training_programs (derived_from_program_version_id)
  where derived_from_program_version_id is not null;
create index training_programs_customized_for_athlete_idx
  on public.training_programs (customized_for_athlete_user_id)
  where customized_for_athlete_user_id is not null;
create index training_program_exercises_exercise_id_idx
  on public.training_program_exercises (exercise_id);

create or replace function public.phatbot_protect_published_program_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
    and current_setting('phatbot.allow_published_program_repair', true) = 'on'
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if old.status in ('published', 'retired') then
    raise exception 'Published program versions are immutable; create a new draft version';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create or replace function public.phatbot_protect_published_program_day()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_status text;
  new_status text;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
    and current_setting('phatbot.allow_published_program_repair', true) = 'on'
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select p.status into old_status
    from public.training_programs p
    where p.id = old.program_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select p.status into new_status
    from public.training_programs p
    where p.id = new.program_id;
  end if;

  if old_status in ('published', 'retired') or new_status in ('published', 'retired') then
    raise exception 'Published program workout templates are immutable; create a new draft version';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create or replace function public.phatbot_protect_published_program_exercise()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_status text;
  new_status text;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
    and current_setting('phatbot.allow_published_program_repair', true) = 'on'
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select p.status into old_status
    from public.training_program_days d
    join public.training_programs p on p.id = d.program_id
    where d.id = old.program_day_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select p.status into new_status
    from public.training_program_days d
    join public.training_programs p on p.id = d.program_id
    where d.id = new.program_day_id;
  end if;

  if old_status in ('published', 'retired') or new_status in ('published', 'retired') then
    raise exception 'Published exercise prescriptions are immutable; create a new draft version';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger training_programs_protect_published
before update or delete on public.training_programs
for each row execute function public.phatbot_protect_published_program_version();

create trigger training_program_days_protect_published
before insert or update or delete on public.training_program_days
for each row execute function public.phatbot_protect_published_program_day();

create trigger training_program_exercises_protect_published
before insert or update or delete on public.training_program_exercises
for each row execute function public.phatbot_protect_published_program_exercise();

alter table public.program_families enable row level security;

revoke all on table public.program_families from anon, authenticated;
grant select, insert, update, delete on table public.program_families to authenticated;
grant all on table public.program_families to service_role;

revoke all on table public.training_programs from anon, authenticated;
revoke all on table public.training_program_days from anon, authenticated;
revoke all on table public.training_program_exercises from anon, authenticated;
grant select, insert, update, delete on table public.training_programs to authenticated;
grant select, insert, update, delete on table public.training_program_days to authenticated;
grant select, insert, update, delete on table public.training_program_exercises to authenticated;

drop policy if exists "published programs readable" on public.training_programs;
drop policy if exists "published program days readable" on public.training_program_days;
drop policy if exists "published program exercises readable" on public.training_program_exercises;

create policy program_families_read_permitted
on public.program_families
for select
to authenticated
using (
  ((select auth.uid()) is not null and source_type = 'phatbot_stock' and visibility = 'stock_catalog')
  or owner_user_id = (select auth.uid())
  or created_by_user_id = (select auth.uid())
  or exists (
    select 1
    from public.coach_athletes ca
    where ca.coach_user_id = (select auth.uid())
      and ca.athlete_user_id = program_families.owner_user_id
      and ca.active = true
  )
);

create policy program_families_insert_owned
on public.program_families
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and owner_user_id = (select auth.uid())
  and created_by_user_id = (select auth.uid())
  and (
    (source_type = 'coach' and visibility in ('private', 'coach_library') and exists (
      select 1 from public.coach_profiles cp where cp.user_id = (select auth.uid())
    ))
    or (source_type in ('athlete', 'athlete_fork') and visibility = 'private' and exists (
      select 1 from public.athlete_profiles ap where ap.user_id = (select auth.uid())
    ))
  )
);

create policy program_families_update_owned
on public.program_families
for update
to authenticated
using (
  owner_user_id = (select auth.uid())
  and source_type <> 'phatbot_stock'
)
with check (
  owner_user_id = (select auth.uid())
  and created_by_user_id = (select auth.uid())
  and (
    (source_type = 'coach' and visibility in ('private', 'coach_library') and exists (
      select 1 from public.coach_profiles cp where cp.user_id = (select auth.uid())
    ))
    or (source_type in ('athlete', 'athlete_fork') and visibility = 'private' and exists (
      select 1 from public.athlete_profiles ap where ap.user_id = (select auth.uid())
    ))
  )
);

create policy program_families_delete_owned
on public.program_families
for delete
to authenticated
using (
  owner_user_id = (select auth.uid())
  and source_type <> 'phatbot_stock'
);

create policy training_programs_read_permitted
on public.training_programs
for select
to authenticated
using (
  exists (
    select 1
    from public.program_families f
    where f.id = training_programs.program_family_id
      and (
        (training_programs.status in ('published', 'retired') and f.source_type = 'phatbot_stock' and f.visibility = 'stock_catalog')
        or f.owner_user_id = (select auth.uid())
        or f.created_by_user_id = (select auth.uid())
        or exists (
          select 1
          from public.coach_athletes ca
          where ca.coach_user_id = (select auth.uid())
            and ca.athlete_user_id = f.owner_user_id
            and ca.active = true
        )
      )
  )
);

create policy training_programs_insert_owned_draft
on public.training_programs
for insert
to authenticated
with check (
  status = 'draft'
  and authored_by_user_id = (select auth.uid())
  and exists (
    select 1 from public.program_families f
    where f.id = training_programs.program_family_id
      and f.owner_user_id = (select auth.uid())
      and f.source_type <> 'phatbot_stock'
  )
);

create policy training_programs_update_owned_draft
on public.training_programs
for update
to authenticated
using (
  status = 'draft'
  and exists (
    select 1 from public.program_families f
    where f.id = training_programs.program_family_id
      and f.owner_user_id = (select auth.uid())
      and f.source_type <> 'phatbot_stock'
  )
)
with check (
  status = 'draft'
  and authored_by_user_id = (select auth.uid())
  and exists (
    select 1 from public.program_families f
    where f.id = training_programs.program_family_id
      and f.owner_user_id = (select auth.uid())
      and f.source_type <> 'phatbot_stock'
  )
);

create policy training_programs_delete_owned_draft
on public.training_programs
for delete
to authenticated
using (
  status = 'draft'
  and exists (
    select 1 from public.program_families f
    where f.id = training_programs.program_family_id
      and f.owner_user_id = (select auth.uid())
      and f.source_type <> 'phatbot_stock'
  )
);

create policy training_program_days_read_permitted
on public.training_program_days
for select
to authenticated
using (
  exists (
    select 1
    from public.training_programs p
    join public.program_families f on f.id = p.program_family_id
    where p.id = training_program_days.program_id
      and (
        (p.status in ('published', 'retired') and f.source_type = 'phatbot_stock' and f.visibility = 'stock_catalog')
        or f.owner_user_id = (select auth.uid())
        or f.created_by_user_id = (select auth.uid())
        or exists (
          select 1
          from public.coach_athletes ca
          where ca.coach_user_id = (select auth.uid())
            and ca.athlete_user_id = f.owner_user_id
            and ca.active = true
        )
      )
  )
);

create policy training_program_days_write_owned_draft
on public.training_program_days
for all
to authenticated
using (
  exists (
    select 1
    from public.training_programs p
    join public.program_families f on f.id = p.program_family_id
    where p.id = training_program_days.program_id
      and p.status = 'draft'
      and f.owner_user_id = (select auth.uid())
      and f.source_type <> 'phatbot_stock'
  )
)
with check (
  exists (
    select 1
    from public.training_programs p
    join public.program_families f on f.id = p.program_family_id
    where p.id = training_program_days.program_id
      and p.status = 'draft'
      and f.owner_user_id = (select auth.uid())
      and f.source_type <> 'phatbot_stock'
  )
);

create policy training_program_exercises_read_permitted
on public.training_program_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.training_program_days d
    join public.training_programs p on p.id = d.program_id
    join public.program_families f on f.id = p.program_family_id
    where d.id = training_program_exercises.program_day_id
      and (
        (p.status in ('published', 'retired') and f.source_type = 'phatbot_stock' and f.visibility = 'stock_catalog')
        or f.owner_user_id = (select auth.uid())
        or f.created_by_user_id = (select auth.uid())
        or exists (
          select 1
          from public.coach_athletes ca
          where ca.coach_user_id = (select auth.uid())
            and ca.athlete_user_id = f.owner_user_id
            and ca.active = true
        )
      )
  )
);

create policy training_program_exercises_write_owned_draft
on public.training_program_exercises
for all
to authenticated
using (
  exists (
    select 1
    from public.training_program_days d
    join public.training_programs p on p.id = d.program_id
    join public.program_families f on f.id = p.program_family_id
    where d.id = training_program_exercises.program_day_id
      and p.status = 'draft'
      and f.owner_user_id = (select auth.uid())
      and f.source_type <> 'phatbot_stock'
  )
)
with check (
  exists (
    select 1
    from public.training_program_days d
    join public.training_programs p on p.id = d.program_id
    join public.program_families f on f.id = p.program_family_id
    where d.id = training_program_exercises.program_day_id
      and p.status = 'draft'
      and f.owner_user_id = (select auth.uid())
      and f.source_type <> 'phatbot_stock'
  )
);

-- Keep the current Eric RPC contracts stable after the version column rename,
-- while removing PostgreSQL's default PUBLIC execution privilege.
create or replace function public.get_current_eric_program()
returns table (
  program_id uuid,
  name text,
  description text,
  version integer,
  day_count bigint,
  enrolled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.description,
    p.version_number,
    count(d.id),
    exists (
      select 1
      from public.athlete_program_enrollments a
      where a.program_id = p.id
        and a.athlete_user_id = (select auth.uid())
        and a.status = 'active'
    )
  from public.training_programs p
  left join public.training_program_days d on d.program_id = p.id
  where p.status = 'published'
    and p.coach_user_id = (
      select cp.user_id
      from public.coach_profiles cp
      where cp.dashboard_enabled = true
      order by cp.created_at
      limit 1
    )
  group by p.id
  order by p.published_at desc
  limit 1
$$;

revoke execute on function public.get_current_eric_program() from public, anon;
grant execute on function public.get_current_eric_program() to authenticated, service_role;

revoke execute on function public.enroll_in_current_eric_program() from public, anon;
grant execute on function public.enroll_in_current_eric_program() to authenticated, service_role;

revoke execute on function public.enroll_athlete_in_current_eric_program(uuid) from public, anon, authenticated;
grant execute on function public.enroll_athlete_in_current_eric_program(uuid) to service_role;

revoke execute on function public.default_new_athlete_to_eric_program() from public, anon, authenticated;
revoke execute on function public.phatbot_protect_published_program_version() from public, anon, authenticated;
revoke execute on function public.phatbot_protect_published_program_day() from public, anon, authenticated;
revoke execute on function public.phatbot_protect_published_program_exercise() from public, anon, authenticated;
