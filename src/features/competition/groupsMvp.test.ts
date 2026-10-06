import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261006220000_groups_mvp.sql", "utf8");
const page = readFileSync("src/app/groups/page.tsx", "utf8");

describe("PHATBOT Groups MVP", () => {
  it("supports many-to-many athlete group membership", () => {
    expect(migration).toContain("primary key (group_id, athlete_user_id)");
    expect(migration).toContain("athlete_group_members_athlete_idx");
  });

  it("reuses official competition entries and does not create group hardware", () => {
    expect(migration).toContain("from public.competition_entries e");
    expect(migration).toContain("join public.athlete_group_members gm");
    expect(migration).not.toMatch(/insert\s+into\s+public\.competition_awards/i);
    expect(page).toContain("Official hardware is earned only on the overall PHATBOT leaderboard");
  });

  it("requires group membership before returning a scoped leaderboard", () => {
    expect(migration).toContain("if not public.is_athlete_group_member(p_group_id)");
    expect(migration).toContain("Not authorized to view this group");
    expect(migration).toContain("revoke all on function public.athlete_group_leaderboard");
  });

  it("ships Beast, Eager Beaver, and Step King in the first group UI", () => {
    expect(page).toContain('"beast", "eager_beaver", "step_king"');
    expect(page).toContain("Create Group");
    expect(page).toContain("Join Group");
    expect(page).toContain("join_code");
  });
});
