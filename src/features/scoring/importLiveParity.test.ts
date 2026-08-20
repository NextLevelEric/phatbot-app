import { describe, expect, it } from "vitest";
import { scoreExercisePerformance, type ExercisePerformance, type PerformanceSet } from "./progressiveOverload";
import { detectPersonalRecords, type PRSet } from "./personalRecords";
import { calculateWeightedWorkoutScore } from "./workoutScore";

type StoredSet = { weight: number; reps: number; partial_reps: number; set_type?: string; set_number?: number };
type StoredExercise = { position: number; sets: StoredSet[]; notes?: string | null };

function normalizeStoredSets(sets: StoredSet[]): PerformanceSet[] {
  return [...sets]
    .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
    .map((set) => ({
      weight: Number(set.weight),
      reps: set.reps,
      partialReps: set.partial_reps,
      setType: (set.set_type ?? "working") as PerformanceSet["setType"],
    }));
}

function importedSet(weight: number, reps: number, partialReps = 0, setNumber = 1): StoredSet {
  // Historical RPC rows omit an explicit set type; downstream readers treat them as working sets.
  return { weight, reps, partial_reps: partialReps, set_number: setNumber };
}

function liveSet(weight: number, reps: number, partialReps = 0, setNumber = 1): StoredSet {
  return { weight, reps, partial_reps: partialReps, set_type: "working", set_number: setNumber };
}

function exerciseScore(current: StoredExercise, previous: StoredExercise) {
  const currentPerformance: ExercisePerformance = { sets: normalizeStoredSets(current.sets), notes: current.notes };
  const previousPerformance: ExercisePerformance = { sets: normalizeStoredSets(previous.sets), notes: previous.notes };
  return scoreExercisePerformance(currentPerformance, previousPerformance);
}

function prSets(sets: StoredSet[]): PRSet[] {
  return normalizeStoredSets(sets).map((set) => ({
    weight: set.weight,
    reps: set.reps,
    partialReps: set.partialReps,
    setType: set.setType,
  }));
}

function workoutScore(current: StoredExercise[], previous: StoredExercise[]) {
  const ordered = [...current].sort((a, b) => a.position - b.position);
  const first = ordered[0];
  const previousFirst = previous.find((exercise) => exercise.position === first.position)!;
  const currentTop = normalizeStoredSets(first.sets).filter((set) => set.setType !== "warmup").slice(0, 3);
  const previousTop = normalizeStoredSets(previousFirst.sets).filter((set) => set.setType !== "warmup").slice(0, 3);
  const topResults = currentTop.map((set, index) =>
    scoreExercisePerformance({ sets: [set] }, previousTop[index] ? { sets: [previousTop[index]] } : null),
  );
  const accessoryResults = ordered.slice(1).map((exercise) => {
    const prior = previous.find((item) => item.position === exercise.position)!;
    return exerciseScore(exercise, prior);
  });
  return calculateWeightedWorkoutScore(topResults, accessoryResults);
}

describe("historical import and live workout parity", () => {
  it("produces identical exercise scoring from equivalent stored sets", () => {
    const previousImported = { position: 1, sets: [importedSet(100, 8)] };
    const currentImported = { position: 1, sets: [importedSet(100, 10)] };
    const previousLive = { position: 1, sets: [liveSet(100, 8)] };
    const currentLive = { position: 1, sets: [liveSet(100, 10)] };

    expect(exerciseScore(currentImported, previousImported)).toEqual(exerciseScore(currentLive, previousLive));
  });

  it("produces identical bodyweight and partial-rep scoring", () => {
    const previousImported = { position: 2, sets: [importedSet(0, 8, 1)] };
    const currentImported = { position: 2, sets: [importedSet(0, 8, 2)] };
    const previousLive = { position: 2, sets: [liveSet(0, 8, 1)] };
    const currentLive = { position: 2, sets: [liveSet(0, 8, 2)] };

    expect(exerciseScore(currentImported, previousImported)).toEqual(exerciseScore(currentLive, previousLive));
    expect(exerciseScore(currentImported, previousImported).result).toBe("progression");
  });

  it("produces identical PR detection from equivalent imported and live history", () => {
    const historicalImported = [importedSet(50, 10), importedSet(55, 8, 0, 2)];
    const currentImported = [importedSet(55, 10)];
    const historicalLive = [liveSet(50, 10), liveSet(55, 8, 0, 2)];
    const currentLive = [liveSet(55, 10)];

    expect(detectPersonalRecords(prSets(currentImported), prSets(historicalImported))).toEqual(
      detectPersonalRecords(prSets(currentLive), prSets(historicalLive)),
    );
  });

  it("produces the same canonical 60/40 workout score", () => {
    const previousImported: StoredExercise[] = [
      { position: 1, sets: [importedSet(200, 5), importedSet(200, 5, 0, 2), importedSet(200, 5, 0, 3)] },
      { position: 2, sets: [importedSet(30, 10)] },
      { position: 3, sets: [importedSet(0, 8)] },
    ];
    const currentImported: StoredExercise[] = [
      { position: 1, sets: [importedSet(205, 5), importedSet(200, 6, 0, 2), importedSet(200, 5, 1, 3)] },
      { position: 2, sets: [importedSet(30, 11)] },
      { position: 3, sets: [importedSet(0, 9)] },
    ];
    const previousLive: StoredExercise[] = previousImported.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) => ({ ...set, set_type: "working" })) }));
    const currentLive: StoredExercise[] = currentImported.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) => ({ ...set, set_type: "working" })) }));

    expect(workoutScore(currentImported, previousImported)).toEqual(workoutScore(currentLive, previousLive));
  });
});
