import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "supabase/migrations/20261007203000_prescribed_cardio_mvp.sql";
const sql = readFileSync(path, "utf8").replace(/\r/g, "");
const normalized = sql.toLowerCase();

describe("prescribed cardio MVP migration", () => {
  it("models cardio independently from strength program rotation", () => {
    expect(normalized).toContain("create table if not exists public.athlete_cardio_prescriptions");
    expect(normalized).toContain("activity_kind in ('run','walk','bike')");
    expect(normalized).toContain("minimum_distance_meters");
    expect(normalized).toContain("minimum_duration_seconds");
    expect(normalized).toContain("optional_extra");
    expect(normalized).not.toContain("next_program_day_id");
    expect(normalized).not.toContain("program_cursor_revision");
  });

  it("keeps prescriptions private to the athlete", () => {
    expect(normalized).toContain("enable row level security");
    expect(normalized).toContain("for select to authenticated");
    expect(normalized).toContain("(select auth.uid()) = athlete_user_id");
    expect(normalized).toContain("revoke all on table public.athlete_cardio_prescriptions from anon");
  });

  it("seeds only Eric's Wednesday mile and Sunday 5K pilot", () => {
    expect(normalized).toContain("'wednesday short run',1609.344");
    expect(normalized).toContain("'sunday long run',5000");
    expect(normalized).toContain("'d8bfdf85-d317-423f-baaa-9cdc02566c7e'");
  });
});
