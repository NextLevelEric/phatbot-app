-- Athlete Profiles MVP: authenticated, privacy-aware social profile surface.
-- This intentionally exposes only a curated training summary. It does not widen
-- RLS on workout sessions, sets, health data, notes, or coaching records.

create or replace function public.athlete_social_profile(p_athlete_user_id uuid)
returns table(
  athlete_user_id uuid,
  display_name text,
  joined_at timestamptz,
  completed_workouts bigint,
  workouts_last_30_days bigint,
  po_wins_last_30_days bigint,
  official_awards bigint,
  recent_workouts jsonb,
  award_counts jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select
      ap.user_id,
      ap.leaderboard_identity_mode,
      ap.leaderboard_name,
      p.display_name as profile_name,
      p.created_at
    from public.athlete_profiles ap
    join public.profiles p on p.id = ap.user_id
    where ap.user_id = p_athlete_user_id
      and (
        ap.user_id = (select auth.uid())
        or ap.leaderboard_identity_mode in ('profile','custom')
      )
      and (select auth.uid()) is not null
  ),
  session_stats as (
    select
      count(*)::bigint as completed_workouts,
      count(*) filter (where ws.completed_at >= now() - interval '30 days')::bigint as workouts_last_30_days
    from public.workout_sessions ws
    join target t on t.user_id = ws.athlete_user_id
    where ws.status = 'completed' and coalesce(ws.is_test,false) = false
  ),
  po_stats as (
    select coalesce(sum(sc.progression_count),0)::bigint as po_wins_last_30_days
    from public.workout_scores sc
    join public.workout_sessions ws on ws.id = sc.workout_session_id
    join target t on t.user_id = sc.athlete_user_id
    where ws.status = 'completed'
      and coalesce(ws.is_test,false) = false
      and ws.completed_at >= now() - interval '30 days'
  ),
  award_stats as (
    select
      count(*)::bigint as official_awards,
      coalesce(jsonb_object_agg(kind, award_count), '{}'::jsonb) as award_counts
    from (
      select cp.competition::text as kind, count(*)::bigint as award_count
      from public.competition_awards ca
      join public.competition_periods cp on cp.id = ca.period_id
      join target t on t.user_id = ca.athlete_user_id
      group by cp.competition
    ) counts
  ),
  recent as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'session_id', session_id,
      'name', workout_name_snapshot,
      'completed_at', completed_at,
      'po_wins', progression_count,
      'opportunities', scored_exercise_count
    ) order by completed_at desc), '[]'::jsonb) as recent_workouts
    from (
      select
        ws.id as session_id,
        ws.workout_name_snapshot,
        ws.completed_at,
        coalesce(sc.progression_count,0) as progression_count,
        coalesce(sc.scored_exercise_count,0) as scored_exercise_count
      from public.workout_sessions ws
      join target t on t.user_id = ws.athlete_user_id
      left join public.workout_scores sc on sc.workout_session_id = ws.id
      where ws.status = 'completed' and coalesce(ws.is_test,false) = false
      order by ws.completed_at desc
      limit 5
    ) latest
  )
  select
    t.user_id,
    case
      when t.user_id = (select auth.uid()) then coalesce(nullif(trim(t.profile_name),''),'PHATBOT Athlete')
      when t.leaderboard_identity_mode = 'profile' then coalesce(nullif(trim(t.profile_name),''),'PHATBOT Athlete')
      else coalesce(nullif(trim(t.leaderboard_name),''),'PHATBOT Athlete')
    end,
    t.created_at,
    ss.completed_workouts,
    ss.workouts_last_30_days,
    ps.po_wins_last_30_days,
    ast.official_awards,
    r.recent_workouts,
    ast.award_counts
  from target t
  cross join session_stats ss
  cross join po_stats ps
  cross join award_stats ast
  cross join recent r;
$$;

revoke all on function public.athlete_social_profile(uuid) from public, anon;
grant execute on function public.athlete_social_profile(uuid) to authenticated;
