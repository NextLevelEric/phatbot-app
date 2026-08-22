-- Allow an athlete or an active linked coach to replace derived scoring intelligence
-- after PHATBOT has replayed the athlete's completed workout history chronologically.
create or replace function public.backfill_athlete_training_intelligence(
  p_athlete_user_id uuid,
  p_exercise_scores jsonb,
  p_workout_scores jsonb,
  p_personal_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
  v_exercise_count integer := 0;
  v_workout_count integer := 0;
  v_pr_count integer := 0;
begin
  v_allowed := auth.uid() = p_athlete_user_id
    or exists (
      select 1 from public.coach_athletes ca
      where ca.coach_user_id = auth.uid()
        and ca.athlete_user_id = p_athlete_user_id
        and ca.active = true
    );

  if not v_allowed then
    raise exception 'Not authorized to backfill this athlete';
  end if;

  delete from public.exercise_scores where athlete_user_id = p_athlete_user_id;
  delete from public.workout_scores where athlete_user_id = p_athlete_user_id;
  delete from public.personal_records where athlete_user_id = p_athlete_user_id;

  insert into public.exercise_scores (
    athlete_user_id, workout_session_id, exercise_session_id,
    comparison_exercise_session_id, result, score, scoring_weight, explanation_code
  )
  select
    p_athlete_user_id,
    x.workout_session_id,
    x.exercise_session_id,
    x.comparison_exercise_session_id,
    x.result::public.score_result,
    x.score,
    1.000,
    x.explanation_code
  from jsonb_to_recordset(coalesce(p_exercise_scores, '[]'::jsonb)) as x(
    workout_session_id uuid,
    exercise_session_id uuid,
    comparison_exercise_session_id uuid,
    result text,
    score numeric,
    explanation_code text
  );
  get diagnostics v_exercise_count = row_count;

  insert into public.workout_scores (
    athlete_user_id, workout_session_id, score, scored_exercise_count,
    progression_count, neutral_count, regression_count, baseline_count
  )
  select
    p_athlete_user_id,
    x.workout_session_id,
    x.score,
    x.scored_exercise_count,
    x.progression_count,
    x.neutral_count,
    x.regression_count,
    x.baseline_count
  from jsonb_to_recordset(coalesce(p_workout_scores, '[]'::jsonb)) as x(
    workout_session_id uuid,
    score numeric,
    scored_exercise_count integer,
    progression_count integer,
    neutral_count integer,
    regression_count integer,
    baseline_count integer
  );
  get diagnostics v_workout_count = row_count;

  insert into public.personal_records (
    athlete_user_id, exercise_id, exercise_session_id, set_id, pr_type,
    weight, reps, previous_weight, previous_reps, achieved_at
  )
  select
    p_athlete_user_id,
    x.exercise_id,
    x.exercise_session_id,
    x.set_id,
    x.pr_type::public.pr_type,
    x.weight,
    x.reps,
    x.previous_weight,
    x.previous_reps,
    x.achieved_at
  from jsonb_to_recordset(coalesce(p_personal_records, '[]'::jsonb)) as x(
    exercise_id uuid,
    exercise_session_id uuid,
    set_id uuid,
    pr_type text,
    weight numeric,
    reps integer,
    previous_weight numeric,
    previous_reps integer,
    achieved_at timestamptz
  );
  get diagnostics v_pr_count = row_count;

  return jsonb_build_object(
    'exerciseScoresWritten', v_exercise_count,
    'workoutScoresWritten', v_workout_count,
    'personalRecordsWritten', v_pr_count
  );
end;
$$;

revoke all on function public.backfill_athlete_training_intelligence(uuid,jsonb,jsonb,jsonb) from public;
grant execute on function public.backfill_athlete_training_intelligence(uuid,jsonb,jsonb,jsonb) to authenticated;
