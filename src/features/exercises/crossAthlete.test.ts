import { describe, expect, it } from "vitest";
import { bestComparableSet, summarizeCrossAthleteExercise } from "./crossAthlete";

describe("cross-athlete exercise analysis", () => {
  it("excludes assisted and non-scored set types", () => {
    const best = bestComparableSet([
      { weight: 0, reps: 12, set_type: "working", load_type: "assisted_bodyweight" },
      { weight: 100, reps: 12, set_type: "warmup", load_type: "external_load" },
      { weight: 80, reps: 8, set_type: "working", load_type: "external_load" },
    ]);
    expect(best).toMatchObject({ weight: 80, reps: 8 });
  });

  it("summarizes each athlete by canonical exercise without ranking athletes", () => {
    const rows = summarizeCrossAthleteExercise([
      { athleteId: "a", athleteName: "Alex", unit: "lb", canonicalExerciseId: "bench", canonicalExerciseName: "Bench Press", completedAt: "2026-01-01T00:00:00Z", sets: [{ weight: 100, reps: 5, set_type: "working", load_type: "external_load" }] },
      { athleteId: "a", athleteName: "Alex", unit: "lb", canonicalExerciseId: "bench", canonicalExerciseName: "Bench Press", completedAt: "2026-02-01T00:00:00Z", sets: [{ weight: 110, reps: 5, set_type: "working", load_type: "external_load" }] },
      { athleteId: "b", athleteName: "Bailey", unit: "kg", canonicalExerciseId: "bench", canonicalExerciseName: "Bench Press", completedAt: "2026-02-01T00:00:00Z", sets: [{ weight: 50, reps: 5, set_type: "working", load_type: "external_load" }] },
      { athleteId: "b", athleteName: "Bailey", unit: "kg", canonicalExerciseId: "squat", canonicalExerciseName: "Squat", completedAt: "2026-02-01T00:00:00Z", sets: [{ weight: 80, reps: 5, set_type: "working", load_type: "external_load" }] },
    ], "bench");

    expect(rows).toHaveLength(2);
    expect(rows[0].athleteName).toBe("Alex");
    expect(rows[0].exposures).toBe(2);
    expect(rows[0].improvementPercent).toBeCloseTo(10, 5);
    expect(rows[1].unit).toBe("kg");
  });
});
