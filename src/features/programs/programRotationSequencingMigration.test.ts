import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260913203000_program_rotation_sequencing.sql";
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

describe("program rotation sequencing migration", () => {
  it("stores only the assignment-owned next-day cursor", () => {
    expect(normalized).toContain("add column next_program_day_id uuid");
    expect(normalized).toContain("alter column next_program_day_id set not null");
    expect(normalized).not.toContain("next_program_day_number");
    expect(normalized).not.toContain("current_sequence_position");
    expect(normalized).not.toContain("sequence_iteration");
  });

  it("initializes every new assignment at the first ordered day", () => {
    expect(normalized).toContain("where day.program_id = p_program_id order by day.day_number limit 1");
    expect(normalized).toContain("first_program_day_id");
    expect(normalized).toContain("program version has no ordered workouts");
  });

  it("keeps review dates inert and historical", () => {
    const advancement = normalized.slice(
      normalized.indexOf("create or replace function phatbot_private.advance_program_rotation_on_completion"),
    );
    expect(normalized).toContain("p_review_due_at");
    expect(normalized).toContain("review_due_at");
    expect(advancement).not.toContain("review_due_at");
  });

  it("returns the exact version, day, canonical identity, and prescriptions", () => {
    expect(normalized).toContain("create or replace function public.get_next_program_workout");
    for (const field of [
      "assignment_id uuid",
      "review_due_at timestamptz",
      "program_family_id uuid",
      "program_version_id uuid",
      "version_number integer",
      "program_day_id uuid",
      "day_number integer",
      "canonical_exercise_id uuid",
      "prescribed_set_targets text[]",
    ]) {
      expect(normalized).toContain(field);
    }
    expect(normalized).toContain("coalesce(exercise.canonical_exercise_id, exercise.id)");
    expect(normalized).toContain("order by prescription.position nulls last");
  });

  it("allows only the athlete or an active coach to read next workout", () => {
    expect(normalized).toContain("caller_user_id uuid := (select auth.uid())");
    expect(normalized).toContain("ca.coach_user_id = caller_user_id");
    expect(normalized).toContain("ca.athlete_user_id = target_athlete_user_id");
    expect(normalized).toContain("ca.active = true");
    expect(normalized).toContain("not authorized to read this athlete''s next program workout");
  });

  it("starts only the athlete's expected day and snapshots exact content", () => {
    expect(normalized).toContain("create or replace function public.start_my_next_program_workout()");
    expect(normalized).toContain("assignment.next_program_day_id = new.program_day_id");
    expect(normalized).toContain("day.program_id = assignment.program_id");
    expect(normalized).toContain("prescription.prescribed_set_targets");
    expect(normalized).toContain("prescription.notes");
    expect(normalized).toContain("program workout linkage is immutable");
  });

  it("materializes only a lazy hidden comparison identity", () => {
    expect(normalized).toContain("select mapped.workout_id");
    expect(normalized).toContain("if comparison_workout_id is null then");
    expect(normalized).toContain("insert into public.athlete_program_workouts");
    expect(normalized).toContain("'__phatbot_program__ '");
    expect(normalized).toContain("false");
    expect(normalized).not.toMatch(/for\s+day\s+in/);
  });

  it("does not advance on start, read, cancel, custom workouts, or cardio", () => {
    const startFunction = normalized.slice(
      normalized.indexOf("create or replace function public.start_my_next_program_workout"),
      normalized.indexOf("create or replace function phatbot_private.advance_program_rotation_on_completion"),
    );
    expect(startFunction).not.toContain("set next_program_day_id =");
    expect(normalized).toContain("if new.program_assignment_id is null then return new");
    expect(normalized).toContain("if new.status <> 'completed' or old.status = 'completed' then return new");
  });

  it("advances transactionally once only for the still-expected completed day", () => {
    expect(normalized).toContain("before update of status on public.workout_sessions");
    expect(normalized).toContain("for update");
    expect(normalized).toContain("active_assignment.next_program_day_id <> new.program_day_id");
    expect(normalized).toContain("new.program_sequence_advanced_at is not null");
    expect(normalized).toContain("new.program_sequence_advanced_at := clock_timestamp()");
    expect(normalized).toContain("log at least one set before completing a program workout");
  });

  it("wraps from the final day to the first ordered day", () => {
    expect(normalized).toContain("day.day_number >");
    expect(normalized).toContain("if next_day_id is null then");
    expect(normalized).toContain("where day.program_id = active_assignment.program_id order by day.day_number limit 1");
  });

  it("keeps RPC and trigger execution privileges narrow", () => {
    for (const signature of [
      "public.get_next_program_workout(uuid)",
      "public.start_my_next_program_workout()",
      "phatbot_private.guard_program_workout_session_link()",
      "phatbot_private.advance_program_rotation_on_completion()",
    ]) {
      expect(normalized).toContain(`revoke execute on function ${signature}`);
    }
    expect(normalized).toContain(
      "grant execute on function public.start_my_next_program_workout() to authenticated, service_role",
    );
  });

  it("does not mutate protected history, scores, results, or program definitions", () => {
    for (const table of [
      "exercise_scores",
      "workout_scores",
      "personal_records",
      "competition_results",
      "competition_hardware_events",
      "sets",
    ]) {
      expect(normalized).not.toContain(`update public.${table}`);
      expect(normalized).not.toContain(`delete from public.${table}`);
    }
    expect(normalized).not.toContain("update public.training_programs");
    expect(normalized).not.toContain("update public.training_program_days");
    expect(normalized).not.toContain("update public.training_program_exercises");
  });
});
