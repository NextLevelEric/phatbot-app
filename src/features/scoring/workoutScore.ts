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

function comparableAverage(results: ExerciseScoreResult[]) {
  const comparable = results.filter((result) => result.result !== "baseline");
  if (!comparable.length) return { average: null as number | null, count: 0 };
  return {
    average: comparable.reduce((sum, result) => sum + result.score, 0) / comparable.length,
    count: comparable.length,
  };
}

/**
 * Canonical PHATBOT workout rollup.
 *
 * The priority/top block contributes 60% when both blocks have comparable
 * performances. The rest of the workout contributes 40%. If only one block
 * has comparable data, that block becomes the whole score rather than being
 * artificially diluted by missing/baseline work.
 */
export function calculateWeightedWorkoutScore(
  topBlockResults: ExerciseScoreResult[],
  accessoryResults: ExerciseScoreResult[],
): WorkoutScoreResult {
  const top = comparableAverage(topBlockResults);
  const accessory = comparableAverage(accessoryResults);

  const topBlockPercentage = top.average === null ? null : Math.round(top.average * 100);
  const accessoryPercentage = accessory.average === null ? null : Math.round(accessory.average * 100);

  let percentage: number | null = null;
  if (top.average !== null && accessory.average !== null) percentage = Math.round((top.average * 0.6 + accessory.average * 0.4) * 100);
  else if (top.average !== null) percentage = Math.round(top.average * 100);
  else if (accessory.average !== null) percentage = Math.round(accessory.average * 100);

  return {
    percentage,
    topBlockPercentage,
    accessoryPercentage,
    topBlockCount: top.count,
    accessoryCount: accessory.count,
  };
}

// Legacy fallback for callers that do not know which results belong to the
// top block. Keep this stable until every score-producing path is migrated to
// calculateWeightedWorkoutScore.
export function calculateWorkoutScore(items: WorkoutScoreItem[]): WorkoutScoreResult {
  const comparable = items.filter((item) => item.result.result !== "baseline");
  if (comparable.length === 0) return { percentage: null, topBlockPercentage: null, accessoryPercentage: null, topBlockCount: 0, accessoryCount: 0 };
  const average = comparable.reduce((sum, item) => sum + item.result.score, 0) / comparable.length;
  return { percentage: Math.round(average * 100), topBlockPercentage: null, accessoryPercentage: Math.round(average * 100), topBlockCount: 0, accessoryCount: comparable.length };
}
