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

function average(items: WorkoutScoreItem[]) {
  if (items.length === 0) return null;
  return items.reduce((sum, item) => sum + item.result.score, 0) / items.length;
}

export function calculateWorkoutScore(items: WorkoutScoreItem[]): WorkoutScoreResult {
  const comparable = items
    .filter((item) => item.result.result !== "baseline")
    .sort((a, b) => a.position - b.position);

  if (comparable.length === 0) {
    return {
      percentage: null,
      topBlockPercentage: null,
      accessoryPercentage: null,
      topBlockCount: 0,
      accessoryCount: 0,
    };
  }

  const topBlock = comparable.slice(0, 4);
  const accessoryBlock = comparable.slice(4);
  const topAverage = average(topBlock);
  const accessoryAverage = average(accessoryBlock);

  // PHATBOT's normal daily score gives the first four scored exercises about
  // 60% of the workout and later accessory/back-off work about 40%.
  // When a workout has four or fewer comparable exercises there is no second
  // block, so the available work represents 100% of the score.
  const weightedScore = accessoryAverage === null
    ? topAverage!
    : (topAverage! * 0.6) + (accessoryAverage * 0.4);

  return {
    percentage: Math.round(weightedScore * 100),
    topBlockPercentage: Math.round(topAverage! * 100),
    accessoryPercentage: accessoryAverage === null ? null : Math.round(accessoryAverage * 100),
    topBlockCount: topBlock.length,
    accessoryCount: accessoryBlock.length,
  };
}
