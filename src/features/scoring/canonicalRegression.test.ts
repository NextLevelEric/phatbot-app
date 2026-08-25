import { describe, expect, it } from "vitest";
import { scoreExercisePerformance, type ExercisePerformance } from "./progressiveOverload";
import { detectPersonalRecords, type PRSet } from "./personalRecords";
import { calculateStrengthChange } from "./strengthChange";

type CanonicalExercise = {
  id: string;
  previous: ExercisePerformance | null;
  current: ExercisePerformance;
  expected: "baseline" | "progression" | "neutral" | "regression";
  explanation?: string;
};

const working = (weight: number, reps: number, partialReps = 0, notes?: string): ExercisePerformance => ({
  sets: [{ weight, reps, partialReps, setType: "working" }],
  notes,
});

/**
 * Canonical PHATBOT regression workout.
 *
 * Keep this dataset small and intentionally boring. It represents the core
 * training decisions PHATBOT must never silently change as UI, persistence,
 * imports, and reporting evolve.
 */
const canonicalWorkout: CanonicalExercise[] = [
  { id: "baseline", previous: null, current: working(100, 8), expected: "baseline", explanation: "first_comparable_performance" },
  { id: "same-load-rep-win", previous: working(185, 8), current: working(185, 10), expected: "progression", explanation: "same_weight_more_reps" },
  { id: "heavier-valid-win", previous: working(225, 8), current: working(235, 5), expected: "progression", explanation: "higher_weight_three_plus_reps" },
  { id: "heavier-test", previous: working(225, 8), current: working(245, 2), expected: "neutral", explanation: "higher_weight_under_three_reps" },
  { id: "partials-win", previous: working(100, 8), current: working(100, 8, 2), expected: "progression", explanation: "same_weight_reps_more_partials" },
  { id: "technique-protection", previous: working(100, 10), current: working(90, 8, 0, "Dropped weight to improve my form and slow down for better time under tension"), expected: "neutral", explanation: "lower_weight_improved_quality" },
  { id: "planned-deload", previous: working(200, 8), current: working(180, 8, 0, "Deload and technique reset"), expected: "neutral", explanation: "lower_weight_planned_reset" },
  { id: "true-regression", previous: working(200, 8), current: working(190, 7), expected: "regression", explanation: "lower_weight" },
  { id: "skipped", previous: working(50, 12), current: { sets: [] }, expected: "baseline", explanation: "no_scored_work_set" },
];

describe("canonical PHATBOT workout regression dataset", () => {
  for (const exercise of canonicalWorkout) {
    it(`${exercise.id} stays ${exercise.expected}`, () => {
      const result = scoreExercisePerformance(exercise.current, exercise.previous);
      expect(result.result).toBe(exercise.expected);
      if (exercise.explanation) expect(result.explanationCode).toBe(exercise.explanation);
    });
  }

  it("produces the expected workout rollup when baseline/skipped rows are excluded", () => {
    const scored = canonicalWorkout
      .map((exercise) => scoreExercisePerformance(exercise.current, exercise.previous))
      .filter((result) => result.result !== "baseline");

    expect(scored).toHaveLength(7);
    expect(scored.reduce((sum, result) => sum + result.score, 0) / scored.length).toBeCloseTo(4.5 / 7, 8);
  });
});

describe("canonical PR scenarios", () => {
  const s = (weight: number, reps: number, setType = "working"): PRSet => ({ weight, reps, setType });

  it("archives a true heaviest-weight PR", () => {
    const prs = detectPersonalRecords([s(405, 3)], [s(385, 4), s(365, 6)]);
    expect(prs.some((pr) => pr.type === "heaviest_weight" && pr.classification === "true_pr" && pr.weight === 405)).toBe(true);
  });

  it("tracks matched-load rep improvement as best-at-weight instead of an all-time PR", () => {
    const milestones = detectPersonalRecords([s(225, 10)], [s(225, 8), s(235, 5)]);
    expect(milestones.some((record) => record.type === "best_at_weight" && record.classification === "weight_milestone" && record.weight === 225 && record.previousReps === 8 && record.reps === 10)).toBe(true);
    expect(milestones.some((record) => record.classification === "true_pr")).toBe(false);
  });
});

describe("canonical strength-change scenario", () => {
  it("uses comparable exercises only and remains deterministic", () => {
    const result = calculateStrengthChange(
      [
        { exerciseId: "bench", sets: [{ weight: 205, reps: 5, setType: "working" }] },
        { exerciseId: "row", sets: [{ weight: 110, reps: 10, setType: "working" }] },
        { exerciseId: "new-exercise", sets: [{ weight: 80, reps: 12, setType: "working" }] },
      ],
      [
        { exerciseId: "bench", sets: [{ weight: 200, reps: 5, setType: "working" }] },
        { exerciseId: "row", sets: [{ weight: 100, reps: 10, setType: "working" }] },
      ],
    );

    expect(result.comparableExerciseCount).toBe(2);
    expect(result.currentLiftTotal).toBe(2125);
    expect(result.previousLiftTotal).toBe(2000);
    expect(result.percentageChange).toBeCloseTo(6.25, 2);
  });
});
