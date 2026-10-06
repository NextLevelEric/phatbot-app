import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261006204500_train_together_scoped_competitions.sql", "utf8");
const liveCard = readFileSync("src/components/TrainTogetherCard.tsx", "utf8");
const reportCard = readFileSync("src/components/TrainTogetherReportCard.tsx", "utf8");

describe("Train Together scoped competitions", () => {
  it("supports Beast and Eager Beaver through one room-scoped RPC", () => {
    expect(migration).toContain("get_live_workout_room_standings");
    expect(migration).toContain("'beast'::public.competition_kind");
    expect(migration).toContain("'eager_beaver'::public.competition_kind");
    expect(liveCard).toContain('p_competition: "beast"');
    expect(liveCard).toContain('p_competition: "eager_beaver"');
    expect(reportCard).toContain('p_competition: "beast"');
    expect(reportCard).toContain('p_competition: "eager_beaver"');
  });

  it("uses the official Eager Beaver Bayesian consistency formula for the room workout", () => {
    expect(migration).toContain("progression_count + neutral_count * 0.5 + 2.0");
    expect(migration).toContain("opportunities + 4.0");
    expect(migration).toContain("scored_exercise_count");
  });

  it("keeps room competition social-only and out of official hardware", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.competition_(entries|awards)/i);
    expect(liveCard).toContain("Room rankings are social-only");
    expect(reportCard).toContain("never add hardware to the Trophy Cabinet");
  });

  it("requires an authenticated room host or member", () => {
    expect(migration).toContain("Authentication required");
    expect(migration).toContain("Not authorized to view this Train Together room");
    expect(migration).toContain("m.athlete_user_id = caller");
    expect(migration).toContain("revoke all on function public.get_live_workout_room_standings");
  });
});
