import type { ExerciseScoreResult } from "./progressiveOverload";
import type { PersonalRecordResult } from "./personalRecords";

type SupabaseLike = any;

type RawSet = {
  id?: string;
  weight: number;
  reps: number;
  partial_reps: number;
  set_type: string;
};

type ExerciseResultRow = {
  exerciseSessionId: string;
  exerciseId: string;
  comparisonExerciseSessionId: string | null;
  result: ExerciseScoreResult;
  prs: PersonalRecordResult[];
  sets: RawSet[];
};

type PersistArgs = {
  supabase: SupabaseLike;
  athleteUserId: string;
  workoutSessionId: string;
  completedAt: string;
  exerciseRows: ExerciseResultRow[];
  workoutScore: number | null;
};

function matchingSetId(sets: RawSet[], pr: PersonalRecordResult) {
  return sets.find((set) => Number(set.weight) === Number(pr.weight) && set.reps === pr.reps)?.id ?? null;
}

export async function persistWorkoutResults({
  supabase,
  athleteUserId,
  workoutSessionId,
  completedAt,
  exerciseRows,
  workoutScore,
}: PersistArgs) {
  for (const row of exerciseRows) {
    const { error: scoreError } = await supabase.from("exercise_scores").upsert({
      athlete_user_id: athleteUserId,
      workout_session_id: workoutSessionId,
      exercise_session_id: row.exerciseSessionId,
      comparison_exercise_session_id: row.comparisonExerciseSessionId,
      result: row.result.result,
      score: row.result.score,
      scoring_weight: 1,
      explanation_code: row.result.explanationCode,
    }, { onConflict: "exercise_session_id" });
    if (scoreError) throw scoreError;

    for (const pr of row.prs) {
      const { data: existing, error: lookupError } = await supabase
        .from("personal_records")
        .select("id")
        .eq("exercise_session_id", row.exerciseSessionId)
        .eq("pr_type", pr.type)
        .eq("weight", pr.weight)
        .eq("reps", pr.reps)
        .limit(1)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) continue;

      const { error: prError } = await supabase.from("personal_records").insert({
        athlete_user_id: athleteUserId,
        exercise_id: row.exerciseId,
        exercise_session_id: row.exerciseSessionId,
        set_id: matchingSetId(row.sets, pr),
        pr_type: pr.type,
        weight: pr.weight,
        reps: pr.reps,
        previous_weight: pr.previousWeight,
        previous_reps: pr.previousReps,
        achieved_at: completedAt,
      });
      if (prError) throw prError;
    }
  }

  if (workoutScore !== null) {
    const scored = exerciseRows.filter((row) => row.result.result !== "baseline");
    const progressionCount = scored.filter((row) => row.result.result === "progression").length;
    const neutralCount = scored.filter((row) => row.result.result === "neutral").length;
    const regressionCount = scored.filter((row) => row.result.result === "regression").length;
    const baselineCount = exerciseRows.filter((row) => row.result.result === "baseline").length;

    const { error: workoutError } = await supabase.from("workout_scores").upsert({
      athlete_user_id: athleteUserId,
      workout_session_id: workoutSessionId,
      score: workoutScore / 100,
      scored_exercise_count: scored.length,
      progression_count: progressionCount,
      neutral_count: neutralCount,
      regression_count: regressionCount,
      baseline_count: baselineCount,
    }, { onConflict: "workout_session_id" });
    if (workoutError) throw workoutError;
  }
}
