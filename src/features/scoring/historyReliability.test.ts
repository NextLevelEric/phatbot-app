import { describe, expect, it } from "vitest";
import { scoreExercisePerformance, type ExercisePerformance } from "./progressiveOverload";
import { detectPersonalRecords, type PRSet } from "./personalRecords";
import { calculateWeightedWorkoutScore, calculateWorkoutScore } from "./workoutScore";

const performance = (sets: ExercisePerformance["sets"], notes?: string): ExercisePerformance => ({ sets, notes });
const set = (weight: number, reps: number, partialReps = 0, setType: "working" | "top" | "backoff" | "warmup" = "working") => ({ weight, reps, partialReps, setType });
const prSet = (weight: number, reps: number, partialReps = 0, setType = "working"): PRSet => ({ weight, reps, partialReps, setType });

describe("PHATBOT scoring and history reliability audit", () => {
  it("scores historical bodyweight sets exactly like live zero-weight sets", () => {
    const previous = performance([set(0, 8)]);
    const historicalImport = performance([set(0, 10)]);
    const liveWorkout = performance([set(0, 10)]);
    expect(scoreExercisePerformance(historicalImport, previous)).toEqual(scoreExercisePerformance(liveWorkout, previous));
    expect(scoreExercisePerformance(historicalImport, previous).result).toBe("progression");
  });

  it("preserves partial-rep progression after historical import normalization", () => {
    const result = scoreExercisePerformance(performance([set(35, 6, 1)]), performance([set(35, 6)]));
    expect(result.result).toBe("progression");
    expect(result.explanationCode).toBe("same_weight_reps_more_partials");
  });

  it("preserves chained historical drop-set blocks without letting a lower drop-set rewrite the primary score", () => {
    const previous = performance([set(160, 5), set(120, 5), set(80, 6)]);
    const current = performance([set(160, 5), set(120, 5), set(80, 7)]);
    const result = scoreExercisePerformance(current, previous);
    expect(current.sets).toHaveLength(3);
    expect(result.currentBest).toMatchObject({ weight: 160, reps: 5 });
    expect(result.previousBest).toMatchObject({ weight: 160, reps: 5 });
    expect(result.result).toBe("neutral");
  });

  it("keeps a heavier sub-three-rep test neutral rather than calling it regression", () => {
    const result = scoreExercisePerformance(performance([set(245, 2)]), performance([set(225, 8)]));
    expect(result.result).toBe("neutral");
    expect(result.explanationCode).toBe("higher_weight_under_three_reps");
  });

  it("protects intentional technique resets from negative scoring", () => {
    const result = scoreExercisePerformance(performance([set(90, 8)], "Dropped load intentionally to improve form and slow the eccentric"), performance([set(100, 10)]));
    expect(result.result).toBe("neutral");
  });

  it("does not turn skipped historical exercises into regressions", () => {
    const result = scoreExercisePerformance(performance([]), performance([set(50, 12)]));
    expect(result.result).toBe("baseline");
    expect(result.explanationCode).toBe("no_scored_work_set");
  });

  it("detects bodyweight rep PRs at the zero-load bucket", () => {
    const records = detectPersonalRecords([prSet(0, 12)], [prSet(0, 10), prSet(0, 8)]);
    expect(records.some((pr) => pr.type === "matched_load_reps" && pr.weight === 0 && pr.reps === 12)).toBe(true);
  });

  it("does not let warmups create PRs", () => {
    expect(detectPersonalRecords([prSet(315, 1, 0, "warmup")], [prSet(275, 5)])).toHaveLength(0);
  });

  it("uses 60 percent top block and 40 percent accessories when both are comparable", () => {
    const progression = scoreExercisePerformance(performance([set(105, 10)]), performance([set(100, 10)]));
    const neutral = scoreExercisePerformance(performance([set(100, 10)]), performance([set(100, 10)]));
    const regression = scoreExercisePerformance(performance([set(95, 10)]), performance([set(100, 10)]));
    const result = calculateWeightedWorkoutScore([progression, neutral], [regression, neutral]);
    expect(result.topBlockPercentage).toBe(75);
    expect(result.accessoryPercentage).toBe(25);
    expect(result.percentage).toBe(55);
    expect(result.topBlockCount).toBe(2);
    expect(result.accessoryCount).toBe(2);
  });

  it("does not dilute a workout when only the top block is comparable", () => {
    const progression = scoreExercisePerformance(performance([set(105, 10)]), performance([set(100, 10)]));
    const baseline = scoreExercisePerformance(performance([set(20, 10)]), null);
    const result = calculateWeightedWorkoutScore([progression], [baseline]);
    expect(result.percentage).toBe(100);
    expect(result.topBlockPercentage).toBe(100);
    expect(result.accessoryPercentage).toBeNull();
  });

  it("does not dilute a workout when only accessories are comparable", () => {
    const neutral = scoreExercisePerformance(performance([set(100, 10)]), performance([set(100, 10)]));
    const baseline = scoreExercisePerformance(performance([set(225, 5)]), null);
    const result = calculateWeightedWorkoutScore([baseline], [neutral]);
    expect(result.percentage).toBe(50);
    expect(result.topBlockPercentage).toBeNull();
    expect(result.accessoryPercentage).toBe(50);
  });

  it("documents the legacy workout-score helper as a flat-average fallback", () => {
    const progression = scoreExercisePerformance(performance([set(105, 10)]), performance([set(100, 10)]));
    const neutral = scoreExercisePerformance(performance([set(100, 10)]), performance([set(100, 10)]));
    const result = calculateWorkoutScore([{ position: 1, result: progression }, { position: 2, result: neutral }]);
    expect(result.percentage).toBe(75);
    expect(result.topBlockPercentage).toBeNull();
    expect(result.accessoryPercentage).toBe(75);
  });
});
