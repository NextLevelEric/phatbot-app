alter table public.athlete_profiles add column if not exists leaderboard_identity_mode text not null default 'private' check (leaderboard_identity_mode in ('private','profile','custom'));
alter table public.athlete_profiles add column if not exists leaderboard_name text;

create or replace function public.competition_leaderboard(p_period_id uuid)
returns table(rank integer, athlete_user_id uuid, display_name text, score numeric, result_label text, is_me boolean)
language sql
security definer
set search_path=public
as $$
  select
    e.rank,
    e.athlete_user_id,
    case
      when e.athlete_user_id=auth.uid() then 'YOU'
      when ap.leaderboard_identity_mode='profile' then coalesce(nullif(trim(p.display_name),''),'PHATBOT Athlete')
      when ap.leaderboard_identity_mode='custom' then coalesce(nullif(trim(ap.leaderboard_name),''),'PHATBOT Athlete')
      else 'PHATBOT Athlete'
    end,
    e.score,
    e.result_label,
    (e.athlete_user_id=auth.uid())
  from public.competition_entries e
  left join public.athlete_profiles ap on ap.user_id=e.athlete_user_id
  left join public.profiles p on p.id=e.athlete_user_id
  where e.period_id=p_period_id and e.is_eligible=true and auth.role()='authenticated'
  order by e.rank nulls last,e.score desc,e.athlete_user_id;
$$;

revoke all on function public.competition_leaderboard(uuid) from public,anon;
grant execute on function public.competition_leaderboard(uuid) to authenticated;
