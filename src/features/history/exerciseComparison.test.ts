import { describe, expect, it } from "vitest";
import {
  formatHistoricalPerformanceDate,
  mostRecentPerformedExercise,
  reportExerciseStatus,
  type HistoricalExercisePerformance,
} from "./exerciseComparison";

type TestSet = { weight: number; reps: number };

function history(
  workoutSessionId: string,
  completedAt: string,
  sets: TestSet[],
): HistoricalExercisePerformance<TestSet> {
  return { workoutSessionId, completedAt, sets };
}

describe("exercise history comparison", () => {
  it("uses the most recent session where the exercise was actually performed", () => {
    const result = mostRecentPerformedExercise([
      history("older-performed", "2026-08-07T10:00:00Z", [{ weight: 315, reps: 7 }]),
      history("recent-skipped", "2026-08-21T10:00:00Z", []),
      history("middle-performed", "2026-08-14T10:00:00Z", [{ weight: 305, reps: 8 }]),
    ]);

    expect(result?.workoutSessionId).toBe("middle-performed");
  });

  it("keeps a skipped exercise not scored while preserving historical context", () => {
    const previous = history("previous", "2026-08-07T10:00:00Z", [{ weight: 315, reps: 7 }]);
    const status = reportExerciseStatus({
      currentComparableSetCount: 0,
      historicalPerformance: previous,
    });

    expect(status.label).toBe("NOT SCORED");
    expect(status.isScored).toBe(false);
    expect(status.explanation).toContain("previous performance");
  });

  it("does not call a skipped first-time exercise a baseline", () => {
    const status = reportExerciseStatus({
      currentComparableSetCount: 0,
      historicalPerformance: null,
    });

    expect(status.label).toBe("NOT SCORED");
    expect(status.isScored).toBe(false);
  });

  it("uses baseline only for a first recorded performed exercise", () => {
    const status = reportExerciseStatus({
      currentComparableSetCount: 1,
      historicalPerformance: null,
    });

    expect(status.label).toBe("BASELINE");
    expect(status.isScored).toBe(false);
  });

  it("scores a performed exercise against older performed history even after a skipped session", () => {
    const previous = history("previous", "2026-08-07T10:00:00Z", [{ weight: 315, reps: 7 }]);
    const status = reportExerciseStatus({
      currentComparableSetCount: 1,
      historicalPerformance: previous,
    });

    expect(status.label).toBe("SCORED");
    expect(status.isScored).toBe(true);
  });

  it("formats the historical workout date for athlete-facing context", () => {
    expect(formatHistoricalPerformanceDate("2026-08-07T10:00:00Z")).toBe("Aug 7, 2026");
  });
});
