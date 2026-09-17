-- Immutable, athlete-private Sunday weekly progress reports.
-- Training windows are Sunday 00:00 through the following Sunday 00:00
-- in America/New_York. The first launch-forward period begins 2026-09-13.

create table public.weekly_progress_reports (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  finalized_at timestamptz not null default now(),
  calculation_version text not null,
  report_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint weekly_progress_reports_period_check check (period_end > period_start),
  constraint weekly_progress_reports_payload_check check (jsonb_typeof(report_payload) = 'object'),
  unique (athlete_user_id, period_start, period_end)
);

create index weekly_progress_reports_athlete_finalized_idx
  on public.weekly_progress_reports (athlete_user_id, finalized_at desc);

alter table public.weekly_progress_reports enable row level security;
revoke all on table public.weekly_progress_reports from public, anon, authenticated;
grant select on table public.weekly_progress_reports to authenticated;
grant all on table public.weekly_progress_reports to service_role;

create policy weekly_progress_reports_select_own
on public.weekly_progress_reports
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = athlete_user_id);

create or replace function phatbot_private.prevent_weekly_report_update()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  raise exception 'Finalized weekly progress reports are immutable';
end
$$;

revoke all on function phatbot_private.prevent_weekly_report_update() from public, anon, authenticated;
grant execute on function phatbot_private.prevent_weekly_report_update() to service_role;

create trigger weekly_progress_reports_immutable
before update on public.weekly_progress_reports
for each row execute function phatbot_private.prevent_weekly_report_update();

comment on table public.weekly_progress_reports is
  'Immutable athlete-private weekly report snapshots. Raw history remains authoritative; report content is frozen at finalization.';
comment on column public.weekly_progress_reports.report_payload is
  'Versioned, self-contained presentation payload suitable for the weekly report UI and a future share card.';

create or replace function phatbot_private.build_weekly_progress_report(
  p_athlete_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_finalized_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit text;
  v_workouts integer := 0;
  v_training_days integer := 0;
  v_required_exercise_scores integer := 0;
  v_persisted_exercise_scores integer := 0;
  v_required_workout_scores integer := 0;
  v_persisted_workout_scores integer := 0;
  v_wins integer := 0;
  v_neutral integer := 0;
  v_regressions integer := 0;
  v_average_score numeric;
  v_po_status text;
  v_volume numeric := 0;
  v_previous_volume numeric := 0;
  v_volume_change numeric;
  v_exercise_wins jsonb := '[]'::jsonb;
  v_cardio_sessions integer := 0;
  v_cardio_distance numeric := 0;
  v_cardio_improvements jsonb := '[]'::jsonb;
  v_step_days integer := 0;
  v_steps bigint;
  v_bodyweight jsonb;
  v_hardware jsonb := '[]'::jsonb;
  v_targets jsonb := '[]'::jsonb;
  v_headline text;
  v_detail text;
begin
  select ap.preferred_unit into v_unit
  from public.athlete_profiles ap
  where ap.user_id = p_athlete_user_id;
  if not found then raise exception 'Athlete not found'; end if;

  select count(*)::integer,
         count(distinct (ws.completed_at at time zone 'America/New_York')::date)::integer
    into v_workouts, v_training_days
  from public.workout_sessions ws
  where ws.athlete_user_id = p_athlete_user_id
    and ws.status = 'completed'
    and coalesce(ws.is_test, false) = false
    and ws.completed_at >= p_period_start and ws.completed_at < p_period_end;

  select count(es.id)::integer,
         count(score.id)::integer
    into v_required_exercise_scores, v_persisted_exercise_scores
  from public.workout_sessions ws
  join public.exercise_sessions es on es.workout_session_id = ws.id
  left join public.exercise_scores score
    on score.exercise_session_id = es.id and score.athlete_user_id = p_athlete_user_id
  where ws.athlete_user_id = p_athlete_user_id
    and ws.status = 'completed'
    and coalesce(ws.is_test, false) = false
    and ws.completed_at >= p_period_start and ws.completed_at < p_period_end;

  select count(distinct es.workout_session_id)::integer,
         count(distinct wscore.workout_session_id)::integer
    into v_required_workout_scores, v_persisted_workout_scores
  from public.exercise_scores es
  left join public.workout_scores wscore
    on wscore.workout_session_id = es.workout_session_id and wscore.athlete_user_id = p_athlete_user_id
  join public.workout_sessions ws on ws.id = es.workout_session_id
  where es.athlete_user_id = p_athlete_user_id
    and es.result <> 'baseline'
    and ws.status = 'completed'
    and coalesce(ws.is_test, false) = false
    and ws.completed_at >= p_period_start and ws.completed_at < p_period_end;

  if v_workouts = 0 then
    v_po_status := 'not_applicable';
  elsif v_required_exercise_scores <> v_persisted_exercise_scores
     or v_required_workout_scores <> v_persisted_workout_scores then
    v_po_status := 'incomplete';
  elsif v_required_workout_scores = 0 then
    v_po_status := 'baseline_only';
  else
    v_po_status := 'available';
    select coalesce(sum(ws.progression_count), 0)::integer,
           coalesce(sum(ws.neutral_count), 0)::integer,
           coalesce(sum(ws.regression_count), 0)::integer,
           round(avg(ws.score) * 100, 1)
      into v_wins, v_neutral, v_regressions, v_average_score
    from public.workout_scores ws
    join public.workout_sessions session on session.id = ws.workout_session_id
    where ws.athlete_user_id = p_athlete_user_id
      and session.status = 'completed'
      and coalesce(session.is_test, false) = false
      and session.completed_at >= p_period_start and session.completed_at < p_period_end;
  end if;

  select coalesce(sum(s.weight * s.reps), 0)
    into v_volume
  from public.workout_sessions ws
  join public.exercise_sessions es on es.workout_session_id = ws.id
  join public.sets s on s.exercise_session_id = es.id
  where ws.athlete_user_id = p_athlete_user_id
    and ws.status = 'completed' and coalesce(ws.is_test, false) = false
    and ws.completed_at >= p_period_start and ws.completed_at < p_period_end
    and s.set_type::text not in ('warmup', 'timed') and s.reps > 0 and s.weight >= 0;

  select coalesce(sum(s.weight * s.reps), 0)
    into v_previous_volume
  from public.workout_sessions ws
  join public.exercise_sessions es on es.workout_session_id = ws.id
  join public.sets s on s.exercise_session_id = es.id
  where ws.athlete_user_id = p_athlete_user_id
    and ws.status = 'completed' and coalesce(ws.is_test, false) = false
    and ws.completed_at >= ((((p_period_start at time zone 'America/New_York')::date - 7)::timestamp) at time zone 'America/New_York')
    and ws.completed_at < p_period_start
    and s.set_type::text not in ('warmup', 'timed') and s.reps > 0 and s.weight >= 0;
  if v_previous_volume > 0 then
    v_volume_change := round(((v_volume - v_previous_volume) / v_previous_volume) * 100, 1);
  end if;

  if v_po_status = 'available' then
    with wins as (
      select distinct on (coalesce(identity.canonical_exercise_id, current_es.exercise_id))
        coalesce(identity.canonical_exercise_id, current_es.exercise_id) canonical_id,
        coalesce(canonical.name, current_es.exercise_name_snapshot) exercise_name,
        score.explanation_code,
        score.exercise_session_id,
        score.comparison_exercise_session_id,
        session.completed_at
      from public.exercise_scores score
      join public.workout_sessions session on session.id = score.workout_session_id
      join public.exercise_sessions current_es on current_es.id = score.exercise_session_id
      join public.exercises identity on identity.id = current_es.exercise_id
      left join public.exercises canonical on canonical.id = coalesce(identity.canonical_exercise_id, identity.id)
      where score.athlete_user_id = p_athlete_user_id and score.result = 'progression'
        and session.completed_at >= p_period_start and session.completed_at < p_period_end
      order by coalesce(identity.canonical_exercise_id, current_es.exercise_id), session.completed_at desc, score.id
    ), evidence as (
      select wins.*,
        current_set.weight current_weight, current_set.reps current_reps, current_set.partial_reps current_partials,
        previous_set.weight previous_weight, previous_set.reps previous_reps, previous_set.partial_reps previous_partials
      from wins
      left join lateral (
        select s.weight, s.reps, s.partial_reps from public.sets s
        where s.exercise_session_id = wins.exercise_session_id
          and s.set_type::text in ('working', 'top', 'backoff') and s.reps > 0
        order by s.weight desc, s.reps desc, s.partial_reps desc, s.set_number limit 1
      ) current_set on true
      left join lateral (
        select s.weight, s.reps, s.partial_reps from public.sets s
        where s.exercise_session_id = wins.comparison_exercise_session_id
          and s.set_type::text in ('working', 'top', 'backoff') and s.reps > 0
        order by s.weight desc, s.reps desc, s.partial_reps desc, s.set_number limit 1
      ) previous_set on true
      order by completed_at desc, exercise_name
      limit 5
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'canonical_exercise_id', canonical_id, 'name', exercise_name, 'explanation_code', explanation_code,
      'current', case when current_weight is null then null else jsonb_build_object('weight', current_weight, 'reps', current_reps, 'partial_reps', current_partials) end,
      'previous', case when previous_weight is null then null else jsonb_build_object('weight', previous_weight, 'reps', previous_reps, 'partial_reps', previous_partials) end
    ) order by completed_at desc, exercise_name), '[]'::jsonb)
    into v_exercise_wins from evidence;
  end if;

  select count(*)::integer, coalesce(sum(distance_meters), 0)
    into v_cardio_sessions, v_cardio_distance
  from public.cardio_activities
  where athlete_user_id = p_athlete_user_id
    and started_at >= p_period_start and started_at < p_period_end;

  with current_efforts as (
    select seg.id, seg.segment_key, seg.segment_label, seg.duration_seconds,
           activity.activity_type, activity.started_at
    from public.cardio_activity_segments seg
    join public.cardio_activities activity on activity.id = seg.cardio_activity_id
    where seg.athlete_user_id = p_athlete_user_id
      and activity.started_at >= p_period_start and activity.started_at < p_period_end
      and seg.duration_seconds > 0
  ), compared as (
    select current_efforts.*,
      previous.duration_seconds previous_seconds,
      round(previous.duration_seconds - current_efforts.duration_seconds) improvement_seconds
    from current_efforts
    join lateral (
      select prior_seg.duration_seconds
      from public.cardio_activity_segments prior_seg
      join public.cardio_activities prior_activity on prior_activity.id = prior_seg.cardio_activity_id
      where prior_seg.athlete_user_id = p_athlete_user_id
        and prior_seg.segment_key = current_efforts.segment_key
        and prior_activity.activity_type = current_efforts.activity_type
        and prior_activity.started_at < current_efforts.started_at
        and prior_seg.duration_seconds > 0
      order by prior_activity.started_at desc, prior_seg.created_at desc limit 1
    ) previous on true
  ), improved as (
    select * from compared where improvement_seconds > 1
    order by improvement_seconds desc, started_at desc, id limit 3
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', segment_label, 'current_seconds', duration_seconds,
    'previous_seconds', previous_seconds, 'improvement_seconds', improvement_seconds
  ) order by improvement_seconds desc, started_at desc), '[]'::jsonb)
  into v_cardio_improvements from improved;

  select count(distinct metric_date) filter (where steps is not null)::integer,
         sum(steps) filter (where steps is not null)
    into v_step_days, v_steps
  from public.health_daily_metrics
  where athlete_user_id = p_athlete_user_id
    and metric_date >= (p_period_start at time zone 'America/New_York')::date
    and metric_date < (p_period_end at time zone 'America/New_York')::date;

  with measures as (
    select measured_at,
      case when v_unit = 'kg' then weight_kg else weight_kg / 0.45359237 end value
    from public.bodyweight_measurements
    where athlete_user_id = p_athlete_user_id
      and measured_at >= p_period_start and measured_at < p_period_end
    order by measured_at, created_at
  ), endpoints as (
    select count(*) total, (array_agg(value order by measured_at))[1] first_value,
      (array_agg(value order by measured_at desc))[1] latest_value from measures
  )
  select case when total >= 2 then jsonb_build_object(
    'unit', v_unit, 'first', round(first_value, 1), 'latest', round(latest_value, 1),
    'change', round(latest_value - first_value, 1)
  ) else null end into v_bodyweight from endpoints;

  select coalesce(jsonb_agg(jsonb_build_object(
    'award_id', award.id, 'competition', period.competition, 'cadence', period.cadence,
    'award_key', award.award_key, 'rank', award.rank, 'period_start', period.period_start,
    'period_end', period.period_end, 'finalized_at', period.finalized_at
  ) order by period.finalized_at desc, period.competition), '[]'::jsonb)
  into v_hardware
  from public.competition_awards award
  join public.competition_periods period on period.id = award.period_id
  where award.athlete_user_id = p_athlete_user_id
    and period.status = 'finalized'
    and period.finalized_at >= p_period_start and period.finalized_at <= p_finalized_at;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', 'exercise', 'label', item->>'name',
    'target', 'Beat ' || (item->'current'->>'weight') || ' × ' || (item->'current'->>'reps')
  )), '[]'::jsonb)
  into v_targets
  from jsonb_array_elements(v_exercise_wins) item
  where item->'current' is not null;

  if v_workouts = 0 then
    v_headline := 'A quiet training week';
    v_detail := 'No eligible completed workouts were recorded. Your next session can start a fresh baseline.';
  elsif v_po_status = 'incomplete' then
    v_headline := v_workouts || case when v_workouts = 1 then ' workout recorded' else ' workouts recorded' end;
    v_detail := 'Training is saved, but progressive-overload scoring is incomplete, so PHATBOT did not undercount your progress.';
  elsif v_po_status = 'baseline_only' then
    v_headline := 'Baselines established';
    v_detail := 'This week created comparable starting points for future progress.';
  elsif v_wins > 0 then
    v_headline := v_wins || case when v_wins = 1 then ' exercise win' else ' exercise wins' end;
    v_detail := 'Authoritative progressive-overload scores found measurable improvement this week.';
  else
    v_headline := 'Training week complete';
    v_detail := 'Your completed work and current baselines are preserved for the next comparison.';
  end if;

  return jsonb_build_object(
    'schema_version', 1,
    'time_zone', 'America/New_York',
    'period', jsonb_build_object('start', p_period_start, 'end', p_period_end),
    'summary', jsonb_build_object('headline', v_headline, 'detail', v_detail),
    'workouts', jsonb_build_object('completed', v_workouts, 'training_days', v_training_days),
    'progressive_overload', jsonb_build_object(
      'status', v_po_status, 'required_exercise_scores', v_required_exercise_scores,
      'persisted_exercise_scores', v_persisted_exercise_scores,
      'required_workout_scores', v_required_workout_scores, 'persisted_workout_scores', v_persisted_workout_scores,
      'wins', case when v_po_status = 'available' then v_wins else null end,
      'neutral', case when v_po_status = 'available' then v_neutral else null end,
      'regressions', case when v_po_status = 'available' then v_regressions else null end,
      'average_score_percent', case when v_po_status = 'available' then v_average_score else null end
    ),
    'training_volume', jsonb_build_object('value', v_volume, 'previous_value', v_previous_volume, 'change_percent', v_volume_change, 'unit', v_unit),
    'exercise_wins', v_exercise_wins,
    'cardio', jsonb_build_object('sessions', v_cardio_sessions, 'distance_meters', v_cardio_distance, 'comparable_improvements', v_cardio_improvements),
    'steps', jsonb_build_object('status', case when v_step_days = 7 then 'available' else 'unavailable' end,
      'total', case when v_step_days = 7 then v_steps else null end, 'recorded_days', v_step_days),
    'bodyweight', v_bodyweight,
    'hardware', v_hardware,
    'next_targets', v_targets
  );
end
$$;

revoke all on function phatbot_private.build_weekly_progress_report(uuid, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function phatbot_private.build_weekly_progress_report(uuid, timestamptz, timestamptz, timestamptz)
  to service_role;

create or replace function phatbot_private.finalize_weekly_progress_report(
  p_athlete_user_id uuid,
  p_period_start timestamptz
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_local_start timestamp;
  v_period_end timestamptz;
  v_ready_at timestamptz;
  v_finalized_at timestamptz := clock_timestamp();
  v_id uuid;
begin
  if p_athlete_user_id is null or p_period_start is null then raise exception 'Athlete and period start are required'; end if;
  v_local_start := p_period_start at time zone 'America/New_York';
  if v_local_start::time <> time '00:00:00'
     or extract(dow from v_local_start)::integer <> 0
     or (v_local_start at time zone 'America/New_York') <> p_period_start then
    raise exception 'Weekly report period must begin Sunday at midnight America/New_York';
  end if;
  if v_local_start::date < date '2026-09-13' then raise exception 'Weekly reports are launch-forward only'; end if;

  v_period_end := ((v_local_start::date + 7)::timestamp at time zone 'America/New_York');
  v_ready_at := (((v_local_start::date + 7)::timestamp + interval '12 hours 30 minutes') at time zone 'America/New_York');
  if v_finalized_at < v_ready_at then raise exception 'Weekly report is not ready to finalize'; end if;

  insert into public.weekly_progress_reports (
    athlete_user_id, period_start, period_end, finalized_at, calculation_version, report_payload
  ) values (
    p_athlete_user_id, p_period_start, v_period_end, v_finalized_at, 'weekly-report-v1',
    phatbot_private.build_weekly_progress_report(p_athlete_user_id, p_period_start, v_period_end, v_finalized_at)
  )
  on conflict (athlete_user_id, period_start, period_end) do nothing
  returning id into v_id;

  if v_id is null then
    select report.id into v_id from public.weekly_progress_reports report
    where report.athlete_user_id = p_athlete_user_id
      and report.period_start = p_period_start and report.period_end = v_period_end;
  end if;
  return v_id;
end
$$;

revoke all on function phatbot_private.finalize_weekly_progress_report(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function phatbot_private.finalize_weekly_progress_report(uuid, timestamptz)
  to service_role;

create or replace function public.finalize_my_weekly_progress_report(p_period_start timestamptz)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  return phatbot_private.finalize_weekly_progress_report(v_user_id, p_period_start);
end
$$;

revoke all on function public.finalize_my_weekly_progress_report(timestamptz) from public, anon;
grant execute on function public.finalize_my_weekly_progress_report(timestamptz) to authenticated, service_role;

create or replace function phatbot_private.finalize_due_weekly_progress_reports(p_as_of timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_as_of at time zone 'America/New_York';
  v_period_start timestamptz;
  v_count integer := 0;
  athlete record;
begin
  -- Cron is intentionally a narrow Sunday retry window. The authenticated RPC
  -- is the safe fallback if scheduling is delayed beyond it.
  if extract(dow from v_local)::integer <> 0
     or v_local::time < time '12:30:00'
     or v_local::time >= time '14:00:00' then
    return 0;
  end if;
  v_period_start := ((v_local::date - 7)::timestamp at time zone 'America/New_York');
  if (v_period_start at time zone 'America/New_York')::date < date '2026-09-13' then return 0; end if;

  for athlete in select user_id from public.athlete_profiles order by user_id loop
    perform phatbot_private.finalize_weekly_progress_report(athlete.user_id, v_period_start);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

revoke all on function phatbot_private.finalize_due_weekly_progress_reports(timestamptz)
  from public, anon, authenticated;
grant execute on function phatbot_private.finalize_due_weekly_progress_reports(timestamptz)
  to service_role;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception 'pg_cron schedule function is required for weekly report finalization';
  end if;
  if not exists (select 1 from cron.job where jobname = 'phatbot-weekly-progress-reports') then
    perform cron.schedule(
      'phatbot-weekly-progress-reports',
      '*/15 * * * *',
      'select phatbot_private.finalize_due_weekly_progress_reports();'
    );
  end if;
end
$$;
