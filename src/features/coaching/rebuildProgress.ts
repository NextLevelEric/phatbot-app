import type { SupabaseClient } from "@supabase/supabase-js";

type RawSet = { weight: number; reps: number; set_type: string };
type Stage = "rebuild_started" | "baseline_established" | "rebuilding_progress" | "plateau_cleared";

function estimatedStrength(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

function bestStrength(sets: RawSet[]) {
  return Math.max(0, ...sets.filter((set) => set.set_type !== "warmup" && set.reps > 0).map((set) => estimatedStrength(Number(set.weight), Number(set.reps))));
}

export async function syncAthleteRebuildProgress(supabase: SupabaseClient, athleteUserId: string) {
  const { data: adjustments, error: adjustmentError } = await supabase
    .from("exercise_coaching_adjustments")
    .select("id,exercise_id,exercise_session_id,workout_session_id,accepted_at")
    .eq("athlete_user_id", athleteUserId)
    .eq("adjustment_type", "plateau_rebuild")
    .order("accepted_at", { ascending: true });
  if (adjustmentError) throw adjustmentError;

  const latestAdjustmentByExercise = new Map<string, any>();
  for (const adjustment of adjustments ?? []) latestAdjustmentByExercise.set(adjustment.exercise_id, adjustment);
  const results: { exerciseId: string; stage: Stage }[] = [];

  for (const [exerciseId, adjustment] of latestAdjustmentByExercise) {
    const { data: rebuildExercise, error: rebuildError } = await supabase
      .from("exercise_sessions")
      .select("exercise_name_snapshot,sets(weight,reps,set_type)")
      .eq("id", adjustment.exercise_session_id)
      .single();
    if (rebuildError || !rebuildExercise) continue;

    const rebuildStrength = bestStrength((rebuildExercise.sets ?? []) as RawSet[]);
    if (rebuildStrength <= 0) continue;

    const { data: adjustmentWorkout } = await supabase
      .from("workout_sessions")
      .select("completed_at")
      .eq("id", adjustment.workout_session_id)
      .eq("athlete_user_id", athleteUserId)
      .eq("status", "completed")
      .maybeSingle();
    if (!adjustmentWorkout?.completed_at) continue;

    const { data: priorSessions } = await supabase
      .from("workout_sessions")
      .select("id,completed_at")
      .eq("athlete_user_id", athleteUserId)
      .eq("status", "completed")
      .lt("completed_at", adjustmentWorkout.completed_at)
      .order("completed_at", { ascending: false });
    const priorIds = (priorSessions ?? []).map((row) => row.id);
    let preRebuildStrength = rebuildStrength;
    if (priorIds.length) {
      const { data: priorExercises } = await supabase
        .from("exercise_sessions")
        .select("sets(weight,reps,set_type)")
        .eq("exercise_id", exerciseId)
        .in("workout_session_id", priorIds);
      const strengths = (priorExercises ?? []).map((row) => bestStrength((row.sets ?? []) as RawSet[])).filter((value) => value > 0);
      if (strengths.length) preRebuildStrength = Math.max(...strengths);
    }

    const { data: laterSessions } = await supabase
      .from("workout_sessions")
      .select("id,completed_at")
      .eq("athlete_user_id", athleteUserId)
      .eq("status", "completed")
      .gt("completed_at", adjustmentWorkout.completed_at)
      .order("completed_at", { ascending: true });
    const laterIds = (laterSessions ?? []).map((row) => row.id);
    let laterStrengths: number[] = [];
    if (laterIds.length) {
      const { data: laterExercises } = await supabase
        .from("exercise_sessions")
        .select("sets(weight,reps,set_type)")
        .eq("exercise_id", exerciseId)
        .in("workout_session_id", laterIds);
      laterStrengths = (laterExercises ?? []).map((row) => bestStrength((row.sets ?? []) as RawSet[])).filter((value) => value > 0);
    }

    const postRebuildSessions = laterStrengths.length;
    const latestStrength = postRebuildSessions ? laterStrengths.at(-1)! : rebuildStrength;
    const bestAfterRebuild = postRebuildSessions ? Math.max(...laterStrengths) : rebuildStrength;
    const progressFromRebuild = rebuildStrength > 0 ? ((bestAfterRebuild - rebuildStrength) / rebuildStrength) * 100 : 0;
    const recoveryToPreRebuild = preRebuildStrength > 0 ? ((bestAfterRebuild - preRebuildStrength) / preRebuildStrength) * 100 : 0;

    let stage: Stage = "rebuild_started";
    if (postRebuildSessions >= 1) stage = "baseline_established";
    if (postRebuildSessions >= 1 && progressFromRebuild >= 1) stage = "rebuilding_progress";
    if (postRebuildSessions >= 1 && recoveryToPreRebuild >= 1) stage = "plateau_cleared";

    const now = new Date().toISOString();
    const { error } = await supabase.from("exercise_rebuild_progress").upsert({
      athlete_user_id: athleteUserId,
      exercise_id: exerciseId,
      exercise_name: rebuildExercise.exercise_name_snapshot,
      coaching_adjustment_id: adjustment.id,
      rebuild_workout_session_id: adjustment.workout_session_id,
      rebuild_started_at: adjustment.accepted_at,
      pre_rebuild_strength: preRebuildStrength,
      rebuild_baseline_strength: rebuildStrength,
      latest_strength: latestStrength,
      progress_from_rebuild_percent: progressFromRebuild,
      recovery_to_pre_rebuild_percent: recoveryToPreRebuild,
      stage,
      post_rebuild_sessions: postRebuildSessions,
      updated_at: now,
      cleared_at: stage === "plateau_cleared" ? now : null,
    }, { onConflict: "athlete_user_id,exercise_id" });
    if (error) throw error;

    if (stage === "plateau_cleared") {
      await supabase.from("exercise_plateau_signals").update({ status: "resolved", resolved_at: now, last_evaluated_at: now }).eq("athlete_user_id", athleteUserId).eq("exercise_id", exerciseId);
    }
    results.push({ exerciseId, stage });
  }

  return results;
}

export function rebuildCoachingMessage(input: { stage: Stage; exerciseName: string; progressPercent?: number | null }) {
  const progress = input.progressPercent ?? 0;
  if (input.stage === "rebuild_started") return { headline: "Rebuild started.", body: `${input.exerciseName} is in a deliberate reset. Clean reps first. No need to rush the load.` };
  if (input.stage === "baseline_established") return { headline: "Baseline established.", body: `${input.exerciseName} has a clean post-rebuild baseline. Hold the quality and build from here.` };
  if (input.stage === "rebuilding_progress") return { headline: "Rebuild is working.", body: `${input.exerciseName} has moved ${progress >= 0 ? "+" : ""}${progress.toFixed(1)}% from the rebuild baseline. Keep stacking controlled progress.` };
  return { headline: "Plateau cleared.", body: `${input.exerciseName} has progressed beyond the pre-rebuild strength signal. PHATBOT is closing this intervention and returning the exercise to normal progression.` };
}
