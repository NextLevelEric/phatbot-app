-- PHATBOT Groups MVP
-- Social competition scopes that reuse official competition entries without awarding hardware.

create table public.athlete_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.athlete_group_members (
  group_id uuid not null references public.athlete_groups(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, athlete_user_id)
);

create index athlete_group_members_athlete_idx on public.athlete_group_members(athlete_user_id, joined_at desc);

alter table public.athlete_groups enable row level security;
alter table public.athlete_group_members enable row level security;

grant select on public.athlete_groups to authenticated;
grant select on public.athlete_group_members to authenticated;
revoke insert, update, delete on public.athlete_groups from anon, authenticated;
revoke insert, update, delete on public.athlete_group_members from anon, authenticated;

create or replace function public.is_athlete_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.athlete_group_members m
      where m.group_id = p_group_id and m.athlete_user_id = (select auth.uid())
    )
$$;

revoke all on function public.is_athlete_group_member(uuid) from public, anon;
grant execute on function public.is_athlete_group_member(uuid) to authenticated;

create policy "group members read groups"
on public.athlete_groups for select to authenticated
using (public.is_athlete_group_member(id));

create policy "group members read memberships"
on public.athlete_group_members for select to authenticated
using (public.is_athlete_group_member(group_id));

create or replace function public.create_athlete_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  new_group_id uuid;
  clean_name text := trim(p_name);
  code text;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 60 then
    raise exception 'Group name must be 2 to 60 characters';
  end if;

  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.athlete_groups g where g.join_code = code);
  end loop;

  insert into public.athlete_groups(name, owner_user_id, join_code)
  values (clean_name, caller, code)
  returning id into new_group_id;

  insert into public.athlete_group_members(group_id, athlete_user_id, role)
  values (new_group_id, caller, 'owner');

  return new_group_id;
end
$$;

create or replace function public.join_athlete_group(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_group uuid;
begin
  if caller is null then raise exception 'Authentication required'; end if;

  select g.id into target_group
  from public.athlete_groups g
  where g.join_code = upper(trim(p_join_code));

  if target_group is null then raise exception 'Group not found'; end if;

  insert into public.athlete_group_members(group_id, athlete_user_id, role)
  values (target_group, caller, 'member')
  on conflict (group_id, athlete_user_id) do nothing;

  return target_group;
end
$$;

create or replace function public.athlete_group_leaderboard(p_group_id uuid, p_period_id uuid)
returns table(
  rank bigint,
  athlete_user_id uuid,
  display_name text,
  score numeric,
  result_label text,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.is_athlete_group_member(p_group_id) then raise exception 'Not authorized to view this group'; end if;

  return query
  with scoped as (
    select
      e.athlete_user_id,
      coalesce(nullif(trim(p.display_name), ''), 'PHATBOT Athlete') as display_name,
      e.score,
      e.result_label
    from public.competition_entries e
    join public.athlete_group_members gm
      on gm.athlete_user_id = e.athlete_user_id and gm.group_id = p_group_id
    left join public.profiles p on p.id = e.athlete_user_id
    where e.period_id = p_period_id and e.is_eligible = true
  )
  select
    rank() over(order by s.score desc) as rank,
    s.athlete_user_id,
    s.display_name,
    s.score,
    s.result_label,
    s.athlete_user_id = (select auth.uid()) as is_me
  from scoped s
  order by rank, s.athlete_user_id;
end
$$;

revoke all on function public.create_athlete_group(text) from public, anon;
revoke all on function public.join_athlete_group(text) from public, anon;
revoke all on function public.athlete_group_leaderboard(uuid, uuid) from public, anon;
grant execute on function public.create_athlete_group(text) to authenticated;
grant execute on function public.join_athlete_group(text) to authenticated;
grant execute on function public.athlete_group_leaderboard(uuid, uuid) to authenticated;

comment on table public.athlete_groups is 'Athlete-created social competition groups. Group standings never create official competition awards.';
