import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261007010000_train_like_athlete.sql", "utf8");
const profile = readFileSync("src/app/athletes/[athleteId]/page.tsx", "utf8");

describe("Train Like This Athlete", () => {
  it("requires a visible athlete identity or self access", () => {
    expect(migration).toContain("leaderboard_identity_mode in ('profile','custom')");
    expect(migration).toContain("ws.athlete_user_id = caller");
    expect(migration).toContain("revoke all on function public.copy_athlete_workout(uuid) from public, anon");
  });

  it("copies workout structure rather than performed training data", () => {
    expect(migration).toContain("prescribed_set_targets_snapshot");
    expect(migration).toContain("target_rounds_snapshot");
    expect(migration).not.toMatch(/insert into public\.sets/i);
    expect(migration).not.toMatch(/insert into public\.workout_sessions/i);
  });

  it("previews and copies from athlete profiles", () => {
    expect(profile).toContain("athlete_shared_workout");
    expect(profile).toContain("copy_athlete_workout");
    expect(profile).toContain("COPY TO MY WORKOUTS");
    expect(profile).toContain("weights, reps performed, notes, and history stay private");
  });
});
