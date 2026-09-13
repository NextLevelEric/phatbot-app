import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260913091557_program_family_immutable_version_foundation.sql";
const sql = readFileSync(migrationPath, "utf8").replace(/\r/g, "");
const normalized = sql.toLowerCase();

describe("program family and immutable version migration", () => {
  it("introduces durable family identity and explicit provenance", () => {
    expect(normalized).toContain("create table public.program_families");
    expect(normalized).toContain(
      "source_type in ('phatbot_stock', 'coach', 'athlete', 'athlete_fork')",
    );
    expect(normalized).toContain(
      "visibility in ('stock_catalog', 'private', 'coach_library')",
    );
    expect(normalized).toContain("owner_user_id uuid references public.profiles(id)");
    expect(normalized).toContain("created_by_user_id uuid references public.profiles(id)");
  });

  it("makes training_programs the version entity with family-scoped uniqueness", () => {
    expect(normalized).toContain("rename column version to version_number");
    expect(normalized).toContain("program_family_id uuid references public.program_families(id)");
    expect(normalized).toContain("unique (program_family_id, version_number)");
    expect(normalized).toContain("derived_from_program_version_id uuid references public.training_programs(id)");
    expect(normalized).toContain("customized_for_athlete_user_id uuid references public.athlete_profiles(user_id)");
    expect(normalized).toContain("sequence_mode text not null default 'rotation'");
  });

  it("backfills Smooth Bear as stock family v1 without recreating existing content", () => {
    expect(normalized).toContain("'smooth-bear-current'");
    expect(normalized).toContain("'smooth-bear-current-meso-1'");
    expect(normalized).toContain("'phatbot_stock'");
    expect(normalized).toMatch(
      /update public\.training_programs p[\s\S]*set program_family_id = f\.id/,
    );
    expect(normalized).not.toMatch(/delete\s+from\s+public\.training_program/i);
    expect(normalized).not.toMatch(/update\s+public\.training_program_days/i);
    expect(normalized).not.toMatch(/update\s+public\.training_program_exercises/i);
  });

  it("protects published version metadata, days, and prescriptions", () => {
    expect(normalized).toContain("create trigger training_programs_protect_published");
    expect(normalized).toContain("create trigger training_program_days_protect_published");
    expect(normalized).toContain("create trigger training_program_exercises_protect_published");
    expect(normalized).toContain("published program versions are immutable");
    expect(normalized).toContain("published program workout templates are immutable");
    expect(normalized).toContain("published exercise prescriptions are immutable");
    expect(normalized).toContain("current_user in ('postgres', 'service_role', 'supabase_admin')");
    expect(normalized).toContain(
      "current_setting('phatbot.allow_published_program_repair', true) = 'on'",
    );
  });

  it("keeps owner-managed draft versions and their content editable", () => {
    expect(normalized).toMatch(
      /create policy training_programs_update_owned_draft[\s\S]*?status = 'draft'/,
    );
    expect(normalized).toMatch(
      /create policy training_program_days_write_owned_draft[\s\S]*?p\.status = 'draft'/,
    );
    expect(normalized).toMatch(
      /create policy training_program_exercises_write_owned_draft[\s\S]*?p\.status = 'draft'/,
    );
  });

  it("allows stock reads without exposing unrelated private families", () => {
    expect(normalized).toMatch(
      /program_families_read_permitted[\s\S]*?source_type = 'phatbot_stock'[\s\S]*?visibility = 'stock_catalog'/,
    );
    expect(normalized).toMatch(
      /training_programs_read_permitted[\s\S]*?f\.owner_user_id = \(select auth\.uid\(\)\)/,
    );
    expect(normalized).toContain("ca.coach_user_id = (select auth.uid())");
    expect(normalized).toContain("ca.active = true");
    expect(normalized).not.toContain("to anon\nusing");
  });

  it("retains canonical exercise foreign keys and adds the missing lookup index", () => {
    expect(normalized).toContain(
      "create index training_program_exercises_exercise_id_idx\n  on public.training_program_exercises (exercise_id)",
    );
    expect(normalized).not.toMatch(/create table public\.(program_)?exercises/i);
    expect(normalized).not.toMatch(/update\s+public\.exercises/i);
  });

  it("tightens touched SECURITY DEFINER function execution without changing the public RPC contract", () => {
    expect(normalized).toContain("returns table (\n  program_id uuid");
    expect(normalized).toContain("version integer");
    expect(normalized).toContain("p.version_number");
    expect(normalized).toContain("security definer\nset search_path = ''");
    expect(normalized).toContain(
      "revoke execute on function public.get_current_eric_program() from public, anon",
    );
    expect(normalized).toContain(
      "revoke execute on function public.enroll_in_current_eric_program() from public, anon",
    );
  });

  it("does not implement assignment, sequencing, workout, or scoring mutations", () => {
    expect(normalized).not.toMatch(
      /(insert into|update|delete from|alter table) public\.athlete_program_enrollments/i,
    );
    expect(normalized).not.toMatch(
      /(insert into|update|delete from|alter table) public\.athlete_program_workouts/i,
    );
    expect(normalized).not.toMatch(
      /(insert into|update|delete from|alter table) public\.(workouts|workout_sessions|exercise_sessions|sets|competition_results)/i,
    );
  });
});
