import { canonicalExerciseId, type ExerciseIdentityRow } from "@/features/exercises/identity";

export type PriorExerciseRow<TSet extends { set_number: number }> = ExerciseIdentityRow & {
  sets: TSet[] | null;
  workout_sessions: { completed_at: string | null } | null;
};

export function buildLiveExerciseHistory<TSet extends { set_number: number }>(
  rows: PriorExerciseRow<TSet>[],
  maxHistory = 6,
) {
  const previousByExercise: Record<string, { completedAt: string; sets: TSet[] }> = {};
  const historyByExercise: Record<string, { completedAt: string; sets: TSet[] }[]> = {};

  const performed = rows
    .filter(row => (row.sets?.length ?? 0) > 0 && Boolean(row.workout_sessions?.completed_at))
    .sort((a, b) => Date.parse(b.workout_sessions!.completed_at!) - Date.parse(a.workout_sessions!.completed_at!));

  for (const row of performed) {
    const identity = canonicalExerciseId(row);
    const entry = {
      completedAt: row.workout_sessions!.completed_at!,
      sets: [...(row.sets ?? [])].sort((a, b) => a.set_number - b.set_number),
    };
    historyByExercise[identity] ??= [];
    if (historyByExercise[identity].length < maxHistory) historyByExercise[identity].push(entry);
    previousByExercise[identity] ??= entry;
  }

  return { previousByExercise, historyByExercise };
}
