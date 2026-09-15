-- Reusable, read-only athlete discovery for currently featured PHATBOT programs.
-- Launches invite athletes to view a published stock program; they never create
-- or alter athlete assignments. Athlete enrollment continues through the
-- existing assign_program_to_athlete RPC.

create table public.program_launches (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete restrict,
  launch_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  headline text,
  summary text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_launches_program_time_unique unique (program_id, launch_at),
  constraint program_launches_headline_not_blank
    check (headline is null or btrim(headline) <> ''),
  constraint program_launches_summary_not_blank
    check (summary is null or btrim(summary) <> '')
);

comment on table public.program_launches is
  'Publisher-managed invitations to discover a published PHATBOT stock program. Launches do not enroll athletes.';
comment on column public.program_launches.launch_at is
  'Exact visibility instant. Product launch dates are resolved from America/New_York when authored.';

create index program_launches_visible_idx
  on public.program_launches (launch_at desc, id)
  where status = 'active';

create trigger program_launches_set_updated_at
before update on public.program_launches
for each row execute function public.set_updated_at();

alter table public.program_launches enable row level security;

revoke all on table public.program_launches from anon, authenticated;
grant select on table public.program_launches to authenticated;
grant all on table public.program_launches to service_role;

create policy program_launches_read_visible
on public.program_launches
for select
to authenticated
using (
  (select auth.uid()) is not null
  and status = 'active'
  and launch_at <= clock_timestamp()
  and exists (
    select 1
    from public.training_programs version
    join public.program_families family on family.id = version.program_family_id
    where version.id = program_launches.program_id
      and version.status = 'published'
      and family.status = 'active'
      and family.source_type = 'phatbot_stock'
      and family.visibility = 'stock_catalog'
  )
);

-- Fail instead of silently targeting an unexpected program family. The latest
-- published immutable version is the same version the stock catalog exposes.
do $$
declare
  strength_family_count integer;
  strength_program_id uuid;
  publisher_user_id uuid;
begin
  select count(*)
  into strength_family_count
  from public.program_families family
  where family.slug = 'strength-as-a-skill'
    and family.source_type = 'phatbot_stock'
    and family.visibility = 'stock_catalog'
    and family.status = 'active';

  if strength_family_count <> 1 then
    raise exception 'Expected exactly one active Strength as a Skill stock family';
  end if;

  select version.id, coalesce(version.published_by_user_id, family.created_by_user_id, family.owner_user_id)
  into strength_program_id, publisher_user_id
  from public.training_programs version
  join public.program_families family on family.id = version.program_family_id
  where family.slug = 'strength-as-a-skill'
    and family.source_type = 'phatbot_stock'
    and family.visibility = 'stock_catalog'
    and family.status = 'active'
    and version.status = 'published'
  order by version.version_number desc, version.id
  limit 1;

  if strength_program_id is null then
    raise exception 'Strength as a Skill has no published program version';
  end if;

  insert into public.program_launches (
    program_id,
    launch_at,
    status,
    headline,
    summary,
    created_by_user_id
  ) values (
    strength_program_id,
    '2026-09-21 00:00 America/New_York'::timestamptz,
    'active',
    'New program available',
    'The next training block is here. Follow the same rotation Eric is running with the group.',
    publisher_user_id
  );
end
$$;
