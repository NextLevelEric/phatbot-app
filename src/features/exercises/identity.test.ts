import { describe, expect, it } from "vitest";
import {
  canonicalExerciseId,
  canonicalExerciseIdentity,
  groupByCanonicalExercise,
  rawExerciseIdsForCanonical,
  sameCanonicalExercise,
  selectableExercise,
} from "./identity";

const DUMBBELL_BENCH = "canonical-dumbbell-bench";

describe("canonical exercise identity", () => {
  it("groups reviewed aliases into one continuous exercise history", () => {
    const rows = [
      { exercise_id: "db-bench", exercise_name_snapshot: "DB Bench", exercise: { canonical_exercise_id: DUMBBELL_BENCH, canonical_name: "Dumbbell Bench Press", name: "DB Bench" } },
      { exercise_id: "dumbbell-bench", exercise_name_snapshot: "Dumbbell Bench", exercise: { canonical_exercise_id: DUMBBELL_BENCH, canonical_name: "Dumbbell Bench Press", name: "Dumbbell Bench" } },
      { exercise_id: DUMBBELL_BENCH, exercise_name_snapshot: "Dumbbell Bench Press", exercise: { canonical_exercise_id: DUMBBELL_BENCH, canonical_name: "Dumbbell Bench Press", name: "Dumbbell Bench Press" } },
    ];

    expect(groupByCanonicalExercise(rows).get(DUMBBELL_BENCH)).toHaveLength(3);
    expect(sameCanonicalExercise(rows[0], rows[2])).toBe(true);
    expect(canonicalExerciseIdentity(rows[0])).toEqual({
      recordedExerciseId: "db-bench",
      canonicalExerciseId: DUMBBELL_BENCH,
      recordedName: "DB Bench",
      canonicalName: "Dumbbell Bench Press",
    });
  });

  it("keeps meaningful variations separate", () => {
    const flat = { exercise_id: "flat-db", exercise: { canonical_exercise_id: DUMBBELL_BENCH } };
    const incline = { exercise_id: "incline-db", exercise: { canonical_exercise_id: "canonical-incline-db" } };
    const machine = { exercise_id: "machine-press", exercise: { canonical_exercise_id: "canonical-machine-press" } };

    expect(sameCanonicalExercise(flat, incline)).toBe(false);
    expect(sameCanonicalExercise(flat, machine)).toBe(false);
    expect(groupByCanonicalExercise([flat, incline, machine])).toHaveLength(3);
  });

  it("leaves an unmapped custom exercise distinct without name guessing", () => {
    const customA = { exercise_id: "custom-a", exercise_name_snapshot: "Eric's bench thing", exercise: { canonical_exercise_id: "custom-a", is_custom: true } };
    const customB = { exercise_id: "custom-b", exercise_name_snapshot: "Eric bench variation", exercise: { canonical_exercise_id: "custom-b", is_custom: true } };

    expect(canonicalExerciseId(customA)).toBe("custom-a");
    expect(sameCanonicalExercise(customA, customB)).toBe(false);
  });

  it("falls back safely for legacy rows with no loaded identity relation", () => {
    expect(canonicalExerciseId({ exercise_id: "legacy" })).toBe("legacy");
  });

  it("shows canonical rows and standalone custom exercises but hides mapped alias rows from new selection", () => {
    expect(selectableExercise({ id: "standard", canonical_exercise_id: "standard", is_standard: true })).toBe(true);
    expect(selectableExercise({ id: "custom", canonical_exercise_id: "custom", is_custom: true })).toBe(true);
    expect(selectableExercise({ id: "old-alias", canonical_exercise_id: "standard", is_custom: true })).toBe(false);
  });

  it("finds every raw historical ID that belongs to a canonical movement", () => {
    const ids = rawExerciseIdsForCanonical([
      { id: "db-bench", canonical_exercise_id: DUMBBELL_BENCH },
      { id: "dumbbell-bench", canonical_exercise_id: DUMBBELL_BENCH },
      { id: "incline", canonical_exercise_id: "canonical-incline" },
    ], [DUMBBELL_BENCH]);

    expect(ids).toEqual(["db-bench", "dumbbell-bench"]);
  });
});
