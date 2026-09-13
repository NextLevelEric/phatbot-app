import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260913181458_athlete_program_assignments.sql";
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

describe("athlete program assignment migration", () => {
  it("reuses enrollments as immutable-version assignment history", () => {
    expect(normalized).toContain(
      "rename column enrolled_at to started_at",
    );
    expect(normalized).toContain(
      "program_id is 'exact immutable training_programs version assigned; never a program family reference.'",
    );
    expect(normalized).toContain("add column review_due_at timestamptz");
    expect(normalized).toContain(
      "it never expires, ends, versions, or advances an assignment",
    );
    expect(normalized).not.toContain("create table public.athlete_program_assignments");
    expect(normalized).not.toContain("alter table public.workout_sessions");
    expect(normalized).not.toContain("update public.workout_sessions");
  });

  it("uses a small controlled lifecycle with consistent timestamps", () => {
    expect(normalized).toContain("check (status in ('active', 'ended'))");
    expect(normalized).toContain(
      "check (source_type in ('coach_assigned', 'athlete_selected', 'athlete_created', 'system_migration'))",
    );
    expect(normalized).toContain("status = 'active' and ended_at is null");
    expect(normalized).toContain("status = 'ended' and ended_at is not null");
    expect(normalized).toContain("ended_at is null or ended_at >= started_at");
  });

  it("enforces exactly one active assignment while preserving repeat history", () => {
    expect(normalized).toContain(
      "create unique index athlete_program_enrollments_one_active_idx",
    );
    expect(normalized).toContain("where status = 'active'");
    expect(normalized).toContain(
      "drop constraint athlete_program_enrollments_athlete_user_id_program_id_key",
    );
    expect(normalized).toContain("set status = 'ended', ended_at = switched_at");
    expect(normalized).not.toContain("delete from public.athlete_program_enrollments");
  });

  it("serializes switching and makes exact duplicate submissions idempotent", () => {
    expect(normalized).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(normalized).toContain("for update");
    expect(normalized).toContain(
      "existing_assignment.assigned_by_user_id is not distinct from p_assigned_by_user_id",
    );
    expect(normalized).toContain("p_review_due_at is not null");
    expect(normalized).toContain("return existing_assignment");
  });

  it("derives assigner identity and authorizes athlete self-selection", () => {
    expect(normalized).toContain("caller_user_id uuid := (select auth.uid())");
    expect(normalized).toContain("p_source_type = 'athlete_selected'");
    expect(normalized).toContain("f.source_type = 'phatbot_stock'");
    expect(normalized).toContain("f.visibility = 'stock_catalog'");
    expect(normalized).toContain("p.status = 'published'");
    expect(normalized).toContain("p_source_type = 'athlete_created'");
  });

  it("limits coach assignment to an active relationship and eligible programs", () => {
    expect(normalized).toContain("ca.coach_user_id = caller_user_id");
    expect(normalized).toContain("ca.athlete_user_id = p_athlete_user_id");
    expect(normalized).toContain("ca.active = true");
    expect(normalized).toContain("p_source_type <> 'coach_assigned'");
    expect(normalized).toContain("not authorized to assign this athlete");
    expect(normalized).toContain("program version is not eligible for assignment");
  });

  it("exposes read-only assignment history to the athlete or active coach", () => {
    expect(normalized).toContain(
      "create policy athlete_program_assignments_read_permitted",
    );
    expect(normalized).toContain(
      "create or replace function public.get_athlete_program_assignments",
    );
    expect(normalized).toContain("order by assignment.started_at desc");
    expect(normalized).toContain("assignment.review_due_at");
    expect(normalized).toContain(
      "grant select on table public.athlete_program_enrollments to authenticated",
    );
    expect(normalized).not.toContain(
      "grant insert, update, delete on table public.athlete_program_enrollments to authenticated",
    );
  });

  it("removes automatic signup enrollment without changing the signup profile trigger", () => {
    expect(normalized).toContain(
      "drop trigger if exists default_new_athlete_eric_program on public.athlete_profiles",
    );
    expect(normalized).toContain(
      "drop function if exists public.default_new_athlete_to_eric_program()",
    );
    expect(normalized).not.toContain("drop trigger on_auth_user_created");
    expect(normalized).not.toContain("drop function public.handle_new_user");
  });

  it("preserves legacy RPC signatures but removes workout materialization", () => {
    expect(normalized).toContain(
      "create or replace function public.enroll_in_current_eric_program()",
    );
    expect(normalized).toContain(
      "create or replace function public.enroll_athlete_in_current_eric_program(p_user uuid)",
    );
    expect(normalized).not.toContain("insert into public.athlete_program_workouts");
    expect(normalized).not.toContain("insert into public.workouts");
    expect(normalized).not.toContain("insert into public.workout_exercises");
  });

  it("keeps sequencing and workout materialization out of Slice 2", () => {
    expect(normalized).not.toContain("current_day_index");
    expect(normalized).not.toContain("next_workout");
    expect(normalized).not.toContain("sequence advancement");
    expect(normalized).not.toContain("insert into public.athlete_program_workouts");
  });

  it("removes public function execution defaults", () => {
    for (const signature of [
      "phatbot_private.switch_program_assignment(uuid, uuid, text, uuid, timestamptz)",
      "public.assign_program_to_athlete(uuid, uuid, text, timestamptz)",
      "public.assign_program_to_athlete(uuid, uuid, text)",
      "public.get_athlete_program_assignments(uuid)",
      "public.enroll_in_current_eric_program()",
      "public.enroll_athlete_in_current_eric_program(uuid)",
    ]) {
      expect(normalized).toContain(`revoke execute on function ${signature}`);
    }
  });
});
