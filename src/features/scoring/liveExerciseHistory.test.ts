import { describe, expect, it } from "vitest";
import { buildLiveExerciseHistory } from "./liveExerciseHistory";

const row = (exerciseId: string, completedAt: string, setNumber: number, canonicalId?: string) => ({
  exercise_id: exerciseId,
  exercise: { id: exerciseId, canonical_exercise_id: canonicalId ?? exerciseId },
  workout_sessions: { completed_at: completedAt },
  sets: [{ set_number: setNumber, reps: 8 }],
});

describe("live exercise history", () => {
  it("chooses the most recent completed performance, not query order", () => {
    const result = buildLiveExerciseHistory([
      row("curl", "2026-10-01T08:00:00Z", 3),
      row("curl", "2026-10-08T08:00:00Z", 1),
    ]);
    expect(result.previousByExercise.curl.completedAt).toBe("2026-10-08T08:00:00Z");
    expect(result.historyByExercise.curl).toHaveLength(2);
  });

  it("matches historical exercise aliases by canonical ID", () => {
    const result = buildLiveExerciseHistory([row("old-curl", "2026-10-08T08:00:00Z", 1, "curl")]);
    expect(result.previousByExercise.curl.sets).toHaveLength(1);
  });

  it("ignores empty performances and sorts recorded sets", () => {
    const missing = { ...row("curl", "2026-10-10T08:00:00Z", 1), sets: [] };
    const recorded = { ...row("curl", "2026-10-08T08:00:00Z", 2), sets: [{ set_number: 2, reps: 8 }, { set_number: 1, reps: 10 }] };
    const result = buildLiveExerciseHistory([missing, recorded]);
    expect(result.previousByExercise.curl.sets.map(set => set.set_number)).toEqual([1, 2]);
  });

  it("does not mix different exercise identities", () => {
    const result = buildLiveExerciseHistory([
      row("curl", "2026-10-08T08:00:00Z", 1),
      row("row", "2026-10-07T08:00:00Z", 1),
    ]);
    expect(Object.keys(result.previousByExercise).sort()).toEqual(["curl", "row"]);
  });

  it("caps recent history without losing the latest performance", () => {
    const rows = Array.from({ length: 9 }, (_, i) => row("curl", new Date(Date.UTC(2026, 9, i + 1)).toISOString(), 1));
    const result = buildLiveExerciseHistory(rows);
    expect(result.historyByExercise.curl).toHaveLength(6);
    expect(result.previousByExercise.curl.completedAt).toBe(rows[8].workout_sessions.completed_at);
  });
});
