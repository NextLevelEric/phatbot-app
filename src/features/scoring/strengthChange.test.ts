import { describe, expect, it } from "vitest";
import { calculateStrengthChange } from "./strengthChange";

describe("PHATBOT strength change", () => {
  it("calculates percentage change from weight times full reps", () => {
    const result = calculateStrengthChange(
      [{ exerciseId: "bench", sets: [{ weight: 100, reps: 10, setType: "working" }] }],
      [{ exerciseId: "bench", sets: [{ weight: 100, reps: 8, setType: "working" }] }],
    );
    expect(result.currentLiftTotal).toBe(1000);
    expect(result.previousLiftTotal).toBe(800);
    expect(result.percentageChange).toBe(25);
  });

  it("excludes warmups", () => {
    const result = calculateStrengthChange(
      [{ exerciseId: "bench", sets: [{ weight: 200, reps: 10, setType: "warmup" }, { weight: 100, reps: 10, setType: "working" }] }],
      [{ exerciseId: "bench", sets: [{ weight: 100, reps: 8, setType: "working" }] }],
    );
    expect(result.currentLiftTotal).toBe(1000);
  });

  it("uses only exercises that exist in both workouts", () => {
    const result = calculateStrengthChange(
      [{ exerciseId: "bench", sets: [{ weight: 100, reps: 10, setType: "working" }] }, { exerciseId: "fly", sets: [{ weight: 50, reps: 10, setType: "working" }] }],
      [{ exerciseId: "bench", sets: [{ weight: 100, reps: 8, setType: "working" }] }],
    );
    expect(result.comparableExerciseCount).toBe(1);
    expect(result.percentageChange).toBe(25);
  });

  it("counts a performed exercise with worse volume as a negative score", () => {
    const result = calculateStrengthChange(
      [{ exerciseId: "bench", sets: [{ weight: 80, reps: 10, setType: "working" }] }],
      [{ exerciseId: "bench", sets: [{ weight: 100, reps: 10, setType: "working" }] }],
    );

    expect(result).toEqual({
      currentLiftTotal: 800,
      previousLiftTotal: 1000,
      percentageChange: -20,
      comparableExerciseCount: 1,
    });
  });

  it("excludes an exercise that was performed previously but is absent today", () => {
    const result = calculateStrengthChange(
      [{ exerciseId: "bench", sets: [{ weight: 110, reps: 10, setType: "working" }] }],
      [
        { exerciseId: "bench", sets: [{ weight: 100, reps: 10, setType: "working" }] },
        { exerciseId: "row", sets: [{ weight: 100, reps: 10, setType: "working" }] },
      ],
    );

    expect(result.percentageChange).toBe(10);
    expect(result.previousLiftTotal).toBe(1000);
    expect(result.comparableExerciseCount).toBe(1);
  });

  it("excludes an explicitly skipped exercise represented by no recorded sets", () => {
    const result = calculateStrengthChange(
      [
        { exerciseId: "bench", sets: [{ weight: 110, reps: 10, setType: "working" }] },
        { exerciseId: "row", sets: [] },
      ],
      [
        { exerciseId: "bench", sets: [{ weight: 100, reps: 10, setType: "working" }] },
        { exerciseId: "row", sets: [{ weight: 100, reps: 10, setType: "working" }] },
      ],
    );

    expect(result.percentageChange).toBe(10);
    expect(result.comparableExerciseCount).toBe(1);
  });

  it("keeps a new exercise without a prior baseline out of the competitive score", () => {
    const result = calculateStrengthChange(
      [
        { exerciseId: "bench", sets: [{ weight: 110, reps: 10, setType: "working" }] },
        { exerciseId: "new-fly", sets: [{ weight: 50, reps: 10, setType: "working" }] },
      ],
      [{ exerciseId: "bench", sets: [{ weight: 100, reps: 10, setType: "working" }] }],
    );

    expect(result.percentageChange).toBe(10);
    expect(result.currentLiftTotal).toBe(1100);
    expect(result.comparableExerciseCount).toBe(1);
  });

  it("scores only performed comparable exercises in a mixed workout", () => {
    const result = calculateStrengthChange(
      [
        { exerciseId: "improved", sets: [{ weight: 120, reps: 10, setType: "working" }] },
        { exerciseId: "regressed", sets: [{ weight: 80, reps: 10, setType: "working" }] },
        { exerciseId: "skipped", sets: [] },
        { exerciseId: "new", sets: [{ weight: 50, reps: 10, setType: "working" }] },
      ],
      [
        { exerciseId: "improved", sets: [{ weight: 100, reps: 10, setType: "working" }] },
        { exerciseId: "regressed", sets: [{ weight: 100, reps: 10, setType: "working" }] },
        { exerciseId: "skipped", sets: [{ weight: 100, reps: 10, setType: "working" }] },
      ],
    );

    expect(result).toEqual({
      currentLiftTotal: 2000,
      previousLiftTotal: 2000,
      percentageChange: 0,
      comparableExerciseCount: 2,
    });
  });

  it("returns no competitive score when all current work lacks a baseline", () => {
    const result = calculateStrengthChange(
      [{ exerciseId: "new", sets: [{ weight: 50, reps: 10, setType: "working" }] }],
      [{ exerciseId: "other", sets: [{ weight: 100, reps: 10, setType: "working" }] }],
    );

    expect(result).toEqual({
      currentLiftTotal: 0,
      previousLiftTotal: 0,
      percentageChange: null,
      comparableExerciseCount: 0,
    });
  });

  it("scores only work recorded so far during an in-progress workout", () => {
    const result = calculateStrengthChange(
      [
        { exerciseId: "started", sets: [{ weight: 50, reps: 10, setType: "working" }] },
        { exerciseId: "not-started", sets: [] },
      ],
      [
        { exerciseId: "started", sets: [{ weight: 100, reps: 10, setType: "working" }] },
        { exerciseId: "not-started", sets: [{ weight: 100, reps: 10, setType: "working" }] },
      ],
    );

    expect(result.percentageChange).toBe(-50);
    expect(result.previousLiftTotal).toBe(1000);
    expect(result.comparableExerciseCount).toBe(1);
  });

  it("reproduces the QA workout without charging skipped exercises as zero volume", () => {
    const result = calculateStrengthChange(
      [
        { exerciseId: "leg-press", sets: [{ weight: 706, reps: 10, setType: "working" }] },
        { exerciseId: "leg-extension", sets: [] },
        { exerciseId: "leg-curl", sets: [] },
        { exerciseId: "rdl", sets: [] },
        { exerciseId: "new-hack-squat", sets: [{ weight: 288, reps: 10, setType: "working" }] },
      ],
      [
        { exerciseId: "leg-press", sets: [{ weight: 2067, reps: 10, setType: "working" }] },
        { exerciseId: "leg-extension", sets: [{ weight: 884, reps: 10, setType: "working" }] },
        { exerciseId: "leg-curl", sets: [{ weight: 823, reps: 10, setType: "working" }] },
        { exerciseId: "rdl", sets: [{ weight: 405, reps: 10, setType: "working" }] },
      ],
    );

    expect(result.currentLiftTotal).toBe(7060);
    expect(result.previousLiftTotal).toBe(20670);
    expect(result.comparableExerciseCount).toBe(1);
    expect(result.percentageChange).toBeCloseTo(-65.84, 2);
  });
});
