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
});
