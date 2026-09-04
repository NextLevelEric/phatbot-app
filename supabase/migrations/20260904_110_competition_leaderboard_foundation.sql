create type public.competition_kind as enum ('beast','eager_beaver','cardio_bunny','step_king');
create type public.competition_cadence as enum ('daily','weekly');
create type public.competition_period_status as enum ('open','reconciling','finalized');

create table public.competition_periods (
  id uuid primary key default gen_random_uuid(),
  competition public.competition_kind not null,
  cadence public.competition_cadence not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  reconcile_at timestamptz not null,
  status public.competition_period_status not null default 'open',
  ruleset_version text not null default 'v1',
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (competition,cadence,period_start)
);

create table public.competition_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.competition_periods(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  score numeric not null,
  rank integer,
  result_label text,
  explanation text,
  source_ref jsonb not null default '{}'::jsonb,
  is_eligible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(period_id,athlete_user_id)
);

create table public.competition_awards (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.competition_periods(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  rank integer not null,
  award_key text not null,
  awarded_at timestamptz not null default now(),
  unique(period_id,athlete_user_id,award_key)
);

create index competition_periods_lookup_idx on public.competition_periods(competition,cadence,status,period_start desc);
create index competition_entries_period_rank_idx on public.competition_entries(period_id,rank,score desc);
create index competition_entries_athlete_idx on public.competition_entries(athlete_user_id,period_id);

alter table public.competition_periods enable row level security;
alter table public.competition_entries enable row level security;
alter table public.competition_awards enable row level security;

create policy "authenticated read competition periods" on public.competition_periods for select to authenticated using (true);
create policy "athletes read own competition entries" on public.competition_entries for select to authenticated using (athlete_user_id = auth.uid());
create policy "athletes read own competition awards" on public.competition_awards for select to authenticated using (athlete_user_id = auth.uid());

create or replace function public.competition_leaderboard(p_period_id uuid)
returns table(rank integer, athlete_user_id uuid, display_name text, score numeric, result_label text, is_me boolean)
language sql security definer set search_path=public
as $$
  select e.rank,e.athlete_user_id,coalesce(nullif(trim(p.display_name),''),'PHATBOT Athlete'),e.score,e.result_label,(e.athlete_user_id=auth.uid())
  from public.competition_entries e
  left join public.profiles p on p.id=e.athlete_user_id
  where e.period_id=p_period_id and e.is_eligible=true and auth.role()='authenticated'
  order by e.rank nulls last,e.score desc,e.athlete_user_id
$$;
grant execute on function public.competition_leaderboard(uuid) to authenticated;