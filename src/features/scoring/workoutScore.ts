import type { ExerciseScoreResult } from "./progressiveOverload";

export type WorkoutScoreItem = {
  position: number;
  result: ExerciseScoreResult;
};

export type WorkoutScoreResult = {
  percentage: number | null;
  topBlockPercentage: number | null;
  accessoryPercentage: number | null;
  topBlockCount: number;
  accessoryCount: number;
};

// Workout-level weighting is now calculated in the report from the first
// exercise's first three non-warmup sets. This helper remains as a fallback
// for older callers and treats exercise-level results as one flat score.
export function calculateWorkoutScore(items: WorkoutScoreItem[]): WorkoutScoreResult {
  const comparable = items.filter((item) => item.result.result !== "baseline");
  if (comparable.length === 0) return { percentage: null, topBlockPercentage: null, accessoryPercentage: null, topBlockCount: 0, accessoryCount: 0 };
  const average = comparable.reduce((sum, item) => sum + item.result.score, 0) / comparable.length;
  return { percentage: Math.round(average * 100), topBlockPercentage: null, accessoryPercentage: Math.round(average * 100), topBlockCount: 0, accessoryCount: comparable.length };
}
