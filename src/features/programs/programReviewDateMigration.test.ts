import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260913214500_program_review_date_management.sql", "utf8")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("program review-date management migration", () => {
  it("updates only the active assignment review metadata", () => {
    expect(sql).toContain("create or replace function public.set_program_assignment_review_due_at");
    expect(sql).toContain("set review_due_at = p_review_due_at");
    expect(sql).toContain("assignment.status = 'active'");
    expect(sql).not.toContain("next_program_day_id =");
    expect(sql).not.toContain("status = 'ended'");
    expect(sql).not.toContain("insert into public.athlete_program_enrollments");
  });

  it("allows only an active connected coach", () => {
    expect(sql).toContain("relationship.coach_user_id = caller_user_id");
    expect(sql).toContain("relationship.athlete_user_id = p_athlete_user_id");
    expect(sql).toContain("relationship.active = true");
    expect(sql).toContain("not authorized to manage this athlete''s program review date");
  });

  it("pins the definer path and removes anonymous execution", () => {
    expect(sql).toContain("security definer set search_path = ''");
    expect(sql).toContain("revoke execute on function public.set_program_assignment_review_due_at(uuid, timestamptz) from public, anon");
    expect(sql).toContain("to authenticated, service_role");
  });
});
