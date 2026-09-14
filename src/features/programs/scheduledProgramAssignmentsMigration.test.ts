import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260914134427_scheduled_future_program_assignments.sql";
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();
const sequencing = readFileSync("supabase/migrations/20260913203000_program_rotation_sequencing.sql", "utf8")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("scheduled future program assignments migration", () => {
  it("extends the existing history table to active, scheduled, and ended only", () => {
    expect(normalized).toContain("status in ('active', 'scheduled', 'ended')");
    expect(normalized).toContain("where status = 'scheduled'");
    expect(normalized).toContain("athlete_program_enrollments_one_scheduled_idx");
    expect(normalized).not.toContain("create table");
  });

  it("uses started_at as midnight Eastern on the coach-selected date", () => {
    expect(normalized).toContain("p_starts_on::timestamp at time zone 'america/new_york'");
    expect(normalized).toContain("p_starts_on <= (clock_timestamp() at time zone 'america/new_york')::date");
  });

  it("derives coach identity and requires an active relationship", () => {
    expect(normalized).toContain("caller_user_id uuid := (select auth.uid())");
    expect(normalized).toMatch(/schedule_program_for_athlete[\s\S]*relationship\.coach_user_id = caller_user_id[\s\S]*relationship\.active = true/);
    expect(normalized).toContain("'coach_assigned'");
  });

  it("only schedules eligible published versions with an ordered first workout", () => {
    expect(normalized).toMatch(/schedule_program_for_athlete[\s\S]*version\.status = 'published'[\s\S]*family\.status = 'active'/);
    expect(normalized).toContain("order by day.day_number, day.id");
    expect(normalized).toContain("program version is not eligible for assignment or has no ordered workouts");
  });

  it("replaces or reschedules the one upcoming row without touching the active row", () => {
    expect(normalized).toMatch(/existing_scheduled[\s\S]*assignment\.status = 'scheduled'[\s\S]*for update/);
    expect(normalized).toMatch(/update public\.athlete_program_enrollments assignment set program_id = p_program_id[\s\S]*where assignment\.id = existing_scheduled\.id/);
  });

  it("cancels only the scheduled row", () => {
    expect(normalized).toMatch(/cancel_scheduled_program_for_athlete[\s\S]*delete from public\.athlete_program_enrollments assignment[\s\S]*assignment\.status = 'scheduled'/);
  });

  it("activates transactionally and initializes Day 1", () => {
    expect(normalized).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(normalized).toMatch(/set status = 'ended',[\s\S]*where assignment\.id = active_assignment\.id/);
    expect(normalized).toMatch(/set status = 'active',[\s\S]*next_program_day_id = first_program_day_id[\s\S]*where assignment\.id = scheduled_assignment\.id/);
  });

  it("is idempotent when activation is repeated", () => {
    expect(normalized).toMatch(/assignment\.status = 'scheduled'[\s\S]*assignment\.started_at <= p_as_of[\s\S]*if scheduled_assignment\.id is null then return false/);
  });

  it("uses Cron plus lazy reconciliation in read, next-workout, and start contracts", () => {
    expect(normalized).toContain("'phatbot-scheduled-program-activation'");
    expect(normalized).toContain("'* * * * *'");
    expect(normalized.match(/perform phatbot_private\.activate_due_program_assignment/g)).toHaveLength(3);
  });

  it("keeps review_due_at independent and nullable", () => {
    expect(normalized).toContain("p_review_due_at timestamptz default null");
    expect(normalized).toContain("review_due_at = p_review_due_at");
  });

  it("keeps privileged functions locked down", () => {
    expect(normalized).toContain("security definer set search_path = ''");
    expect(normalized).toContain("revoke execute on function public.schedule_program_for_athlete(uuid, uuid, date, timestamptz) from public, anon");
    expect(normalized).toContain("revoke execute on function public.cancel_scheduled_program_for_athlete(uuid) from public, anon");
    expect(normalized).toContain("from public, anon, authenticated");
  });

  it("preserves old-session isolation in the existing completion trigger", () => {
    expect(sequencing).toContain("where assignment.id = new.program_assignment_id");
    expect(sequencing).toContain("active_assignment.status <> 'active'");
    expect(sequencing).toContain("return new");
  });
});
