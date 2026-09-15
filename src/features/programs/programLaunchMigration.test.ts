import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260915144850_program_launch_discovery.sql";
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();
const assignmentSql = readFileSync(
  "supabase/migrations/20260913181458_athlete_program_assignments.sql",
  "utf8",
).replace(/\s+/g, " ").toLowerCase();

describe("program launch discovery migration", () => {
  it("adds discovery persistence without creating a second assignment model", () => {
    expect(normalized).toContain("create table public.program_launches");
    expect(normalized).toContain("program_id uuid not null references public.training_programs(id) on delete restrict");
    expect(normalized).not.toContain("athlete_user_id");
    expect(normalized).not.toContain("insert into public.athlete_program_enrollments");
  });

  it("stores the September 21 launch at midnight America/New_York", () => {
    expect(normalized).toContain("'2026-09-21 00:00 america/new_york'::timestamptz");
    expect(normalized).toContain("family.slug = 'strength-as-a-skill'");
    expect(normalized).toContain("order by version.version_number desc");
  });

  it("exposes only active launched stock-catalog versions to authenticated users", () => {
    expect(normalized).toContain("alter table public.program_launches enable row level security");
    expect(normalized).toContain("create policy program_launches_read_visible");
    expect(normalized).toContain("to authenticated using");
    expect(normalized).toContain("launch_at <= clock_timestamp()");
    expect(normalized).toContain("family.source_type = 'phatbot_stock'");
    expect(normalized).toContain("family.visibility = 'stock_catalog'");
    expect(normalized).toContain("version.status = 'published'");
  });

  it("denies client mutation and reserves writes for the service role", () => {
    expect(normalized).toContain("revoke all on table public.program_launches from anon, authenticated");
    expect(normalized).toContain("grant select on table public.program_launches to authenticated");
    expect(normalized).toContain("grant all on table public.program_launches to service_role");
    expect(normalized).not.toMatch(/create policy program_launches_[^ ]+ on public\.program_launches for (insert|update|delete)/);
  });

  it("keeps athlete selection on the existing authorized switch path", () => {
    expect(assignmentSql).toContain("create or replace function public.assign_program_to_athlete");
    expect(assignmentSql).toContain("return phatbot_private.switch_program_assignment");
    expect(assignmentSql).toContain("update public.athlete_program_enrollments assignment set status = 'ended', ended_at = switched_at");
    expect(assignmentSql).toContain("where assignment.athlete_user_id = p_athlete_user_id and assignment.status = 'active'");
  });
});
