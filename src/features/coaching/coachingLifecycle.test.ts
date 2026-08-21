import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("PHATBOT coaching lifecycle wiring", () => {
  it("runs plateau evaluation when a workout is completed", () => {
    const liveWorkout = read("../../app/sessions/[id]/page.tsx");

    expect(liveWorkout).toContain(
      'import { syncAthletePlateauSignals } from "@/features/coaching/plateauSignals";'
    );
    expect(liveWorkout).toMatch(
      /await\s+syncAthletePlateauSignals\(supabase,\s*user\.id\)/
    );
  });

  it("advances rebuild progression after plateau evaluation", () => {
    const plateauSignals = read("./plateauSignals.ts");

    expect(plateauSignals).toContain(
      'import { syncAthleteRebuildProgress } from "@/features/coaching/rebuildProgress";'
    );
    expect(plateauSignals).toMatch(
      /await\s+syncAthleteRebuildProgress\(supabase,\s*athleteUserId\)/
    );
  });

  it("keeps rebuild progression after the plateau upsert loop", () => {
    const plateauSignals = read("./plateauSignals.ts");
    const plateauUpsert = plateauSignals.lastIndexOf(
      'supabase.from("exercise_plateau_signals").upsert'
    );
    const rebuildSync = plateauSignals.indexOf(
      "await syncAthleteRebuildProgress(supabase, athleteUserId)"
    );

    expect(plateauUpsert).toBeGreaterThan(-1);
    expect(rebuildSync).toBeGreaterThan(plateauUpsert);
  });
});
