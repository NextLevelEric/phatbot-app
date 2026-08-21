import type { SupabaseClient } from "@supabase/supabase-js";

type RawSet = { weight: number; reps: number; set_type: string };
type Exposure = { exerciseSessionId: string; exerciseName: string; completedAt: string; strength: number };

function estimatedStrength(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

function bestStrength(sets: RawSet[]) {
  return Math.max(0, ...sets
    .filter((set) => set.set_type !== "warmup" && set.reps > 0)
    .map((set) => estimatedStrength(Number(set.weight), Number(set.reps))));
}

export async function syncAthletePlateauSignals(supabase: SupabaseClient, athleteUserId: string) {
  const { data: workouts, error: workoutError } = await supabase
    .from("workout_sessions")
    .select("id,completed_at")
    .eq("athlete_user_id", athleteUserId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: true });
  if (workoutError) throw workoutError;

  const workoutRows = workouts ?? [];
  if (!workoutRows.length) return [];
  const dates = new Map(workoutRows.map((row) => [row.id, row.completed_at as string]));
  const { data: exerciseRows, error: exerciseError } = await supabase
    .from("exercise_sessions")
    .select("id,exercise_id,exercise_name_snapshot,workout_session_id,sets(weight,reps,set_type)")
    .in("workout_session_id", workoutRows.map((row) => row.id));
  if (exerciseError) throw exerciseError;

  const byExercise = new Map<string, Exposure[]>();
  for (const row of exerciseRows ?? []) {
    const strength = bestStrength((row.sets ?? []) as RawSet[]);
    if (strength <= 0) continue;
    const exposure: Exposure = {
      exerciseSessionId: row.id,
      exerciseName: row.exercise_name_snapshot,
      completedAt: dates.get(row.workout_session_id) ?? "",
      strength,
    };
    const list = byExercise.get(row.exercise_id) ?? [];
    list.push(exposure);
    byExercise.set(row.exercise_id, list);
  }

  const now = new Date().toISOString();
  const results: { exerciseId: string; status: "active" | "resolved"; consecutiveFlatSessions: number }[] = [];
  for (const [exerciseId, exposures] of byExercise.entries()) {
    exposures.sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
    if (exposures.length < 4) continue;

    let consecutiveFlatSessions = 0;
    let bestBefore = exposures[0].strength;
    for (let i = 1; i < exposures.length; i += 1) {
      const improvement = bestBefore > 0 ? ((exposures[i].strength - bestBefore) / bestBefore) * 100 : 0;
      if (improvement >= 1) {
        bestBefore = Math.max(bestBefore, exposures[i].strength);
        consecutiveFlatSessions = 0;
      } else {
        consecutiveFlatSessions += 1;
      }
    }

    const recent = exposures.at(-1)!;
    const baseline = Math.max(...exposures.slice(0, -3).map((item) => item.strength));
    const recentBest = Math.max(...exposures.slice(-3).map((item) => item.strength));
    const changePercent = baseline > 0 ? ((recentBest - baseline) / baseline) * 100 : 0;
    const active = consecutiveFlatSessions >= 3 && changePercent < 1;

    const payload = {
      athlete_user_id: athleteUserId,
      exercise_id: exerciseId,
      exercise_name: recent.exerciseName,
      last_evaluated_at: now,
      consecutive_flat_sessions: consecutiveFlatSessions,
      baseline_strength: baseline,
      recent_strength: recentBest,
      change_percent: changePercent,
      status: active ? "active" : "resolved",
      resolved_at: active ? null : now,
      ...(active ? { detected_at: now } : {}),
    };
    const { error } = await supabase.from("exercise_plateau_signals").upsert(payload, { onConflict: "athlete_user_id,exercise_id" });
    if (error) throw error;
    results.push({ exerciseId, status: active ? "active" : "resolved", consecutiveFlatSessions });
  }
  return results;
}
