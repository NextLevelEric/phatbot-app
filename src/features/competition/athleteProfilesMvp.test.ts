import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261007003000_athlete_profiles_mvp.sql", "utf8");
const profile = readFileSync("src/app/athletes/[athleteId]/page.tsx", "utf8");
const compete = readFileSync("src/app/compete/page.tsx", "utf8");
const groups = readFileSync("src/app/groups/page.tsx", "utf8");

describe("athlete profiles MVP", () => {
  it("respects existing leaderboard identity privacy", () => {
    expect(migration).toContain("leaderboard_identity_mode in (\'profile\',\'custom\')");
    expect(migration).toContain("ap.user_id = (select auth.uid())");
    expect(migration).toContain("revoke all on function public.athlete_social_profile(uuid) from public, anon");
  });

  it("only exposes a curated training summary", () => {
    expect(migration).toContain("completed_workouts");
    expect(migration).toContain("recent_workouts");
    expect(migration).toContain("official_awards");
    expect(migration).not.toContain("health_daily_metrics");
    expect(migration).not.toContain("from public.sets");
  });

  it("links athletes from both social competition surfaces", () => {
    expect(compete).toContain("/athletes/${row.athlete_user_id}");
    expect(groups).toContain("/athletes/${row.athlete_user_id}");
    expect(profile).toContain("Official Trophy Cabinet");
    expect(profile).toContain("Recent Training");
  });
});
