-- Train Together scoped competition standings.
-- Adds a reusable room-scoped competition endpoint for Beast and Eager Beaver.
-- Room results are social only and never write to official competition_entries or competition_awards.

create or replace function public.get_live_workout_room_standings(
  p_room_id uuid,
  p_competition public.competition_kind
)
returns table(
  athlete_user_id uuid,
  athlete_name text,
  workout_session_id uuid,
  session_status text,
  competition public.competition_kind,
  score numeric,
  result_label text,
  detail_label text,
  evidence_count integer,
  rank bigint
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  if p_competition not in ('beast'::public.competition_kind, 'eager_beaver'::public.competition_kind) then
    raise exception 'Train Together currently supports Beast and Eager Beaver';
  end if;

  if not exists (
    select 1
    from public.live_workout_rooms r
    where r.id = p_room_id
      and (
        r.host_user_id = caller
        or exists (
          select 1
          from public.live_workout_room_members m
          where m.room_id = r.id
            and m.athlete_user_id = caller
        )
      )
  ) then
    raise exception 'Not authorized to view this Train Together room';
  end if;

  if p_competition = 'beast'::public.competition_kind then
    return query
    select
      b.athlete_user_id,
      b.athlete_name,
      b.workout_session_id,
      b.session_status,
      'beast'::public.competition_kind,
      b.score,
      b.result_label,
      case
        when b.comparable_exercises > 0
          then b.comparable_exercises::text || ' comparable lift' || case when b.comparable_exercises = 1 then '' else 's' end
        else 'Building baseline'
      end,
      b.comparable_exercises,
      b.rank
    from public.get_live_workout_room_beast(p_room_id) b;
    return;
  end if;

  return query
  with members as (
    select
      m.athlete_user_id,
      m.workout_session_id,
      ws.status::text as session_status,
      coalesce(nullif(trim(p.display_name), ''), 'PHATBOT Athlete') as athlete_name,
      coalesce(wsc.progression_count, 0)::numeric as progression_count,
      coalesce(wsc.neutral_count, 0)::numeric as neutral_count,
      coalesce(wsc.regression_count, 0)::numeric as regression_count,
      coalesce(wsc.scored_exercise_count, 0)::numeric as opportunities
    from public.live_workout_room_members m
    join public.workout_sessions ws on ws.id = m.workout_session_id
    left join public.profiles p on p.id = m.athlete_user_id
    left join public.workout_scores wsc
      on wsc.workout_session_id = m.workout_session_id
      and wsc.athlete_user_id = m.athlete_user_id
    where m.room_id = p_room_id
  ),
  scored as (
    select
      *,
      case
        when session_status = 'completed' and opportunities > 0
          then round(((progression_count + neutral_count * 0.5 + 2.0) / nullif(opportunities + 4.0, 0)) * 100, 2)
      end as eager_score
    from members
  ),
  ranked as (
    select
      *,
      case
        when eager_score is not null
          then rank() over(order by eager_score desc nulls last)
      end as eager_rank
    from scored
  )
  select
    athlete_user_id,
    athlete_name,
    workout_session_id,
    session_status,
    'eager_beaver'::public.competition_kind,
    eager_score,
    case
      when eager_score is not null then round(eager_score, 1)::text || ' Eager'
      when session_status <> 'completed' then 'Finish workout for Eager score'
      else 'Building baseline'
    end,
    case
      when opportunities > 0
        then progression_count::integer::text || ' PO win' || case when progression_count = 1 then '' else 's' end ||
          ' · ' || opportunities::integer::text || ' opportunit' || case when opportunities = 1 then 'y' else 'ies' end
      else 'No comparable PO opportunities yet'
    end,
    opportunities::integer,
    eager_rank
  from ranked
  order by eager_score desc nulls last, athlete_name;
end
$function$;

revoke all on function public.get_live_workout_room_standings(uuid, public.competition_kind) from public, anon;
grant execute on function public.get_live_workout_room_standings(uuid, public.competition_kind) to authenticated;
