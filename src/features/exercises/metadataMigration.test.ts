import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260912180621_canonical_exercise_metadata_foundation.sql";
const sql = readFileSync(migrationPath, "utf8").replace(/\r/g, "");
const athleteWorkoutEditor = readFileSync("src/app/workouts/[id]/page.tsx", "utf8");
const coachWorkoutEditor = readFileSync("src/app/coach/athletes/[athleteId]/workouts/[workoutId]/page.tsx", "utf8");

describe("canonical exercise metadata migration", () => {
  it("uses controlled metadata and supports multiple secondary muscles", () => {
    expect(sql).toContain("create type public.exercise_muscle_group as enum");
    expect(sql).toContain("create type public.exercise_movement_pattern as enum");
    expect(sql).toContain("create type public.exercise_equipment_category as enum");
    expect(sql).toContain("create type public.exercise_classification as enum ('compound','isolation')");
    expect(sql).toContain("create table public.exercise_secondary_muscles");
    expect(sql).toContain("primary key (canonical_exercise_id, muscle_group)");
  });

  it("keeps similar movements distinct canonical rows with substitution-ready metadata", () => {
    for (const name of [
      "Barbell Bench Press",
      "Dumbbell Bench Press",
      "Incline Dumbbell Bench Press",
      "Smith Machine Bench Press",
      "Chest Press Machine",
      "Cable Fly",
      "Barbell Back Squat",
      "Front Squat",
      "Romanian Deadlift",
      "Conventional Deadlift",
      "Seated Cable Row",
      "Chest-Supported Dumbbell Row",
      "Dumbbell Shoulder Press",
      "Barbell Overhead Press",
    ]) expect(sql).toContain(`('${name}'`);

    expect(sql).toMatch(/\('Dumbbell Bench Press'.*'chest'.*'horizontal_push'.*'dumbbell'.*'compound'.*'flat'/);
    expect(sql).toMatch(/\('Chest Press Machine'.*'chest'.*'horizontal_push'.*'machine'.*'compound'.*'seated'/);
    expect(sql).toMatch(/\('Cable Fly'.*'chest'.*'isolation'.*'cable'.*'isolation'.*'standing'/);
  });

  it("maps only explicit reviewed aliases and does not implement fuzzy matching", () => {
    expect(sql).toContain("create table public.exercise_aliases");
    expect(sql).toContain("('DB Bench','Dumbbell Bench Press'");
    expect(sql).toContain("('Dumb Bell Bench Press','Dumbbell Bench Press'");
    expect(sql).toContain("('RDLs','Romanian Deadlift'");
    expect(sql).toContain("('Traditional Deadlift','Conventional Deadlift'");
    expect(sql).not.toContain("('Bench Press','Barbell Bench Press'");
    expect(sql).not.toContain("('Squats','Barbell Back Squat'");
    expect(sql).not.toContain("similarity(");
    expect(sql).not.toContain("levenshtein(");
  });

  it("maps exact standard names for historical and newly-created rows", () => {
    expect(sql).toContain("where e.is_standard = true\n        and e.normalized_name = lower(trim(new.name))");
    expect(sql).toContain("and e.normalized_name = c.normalized_name");
  });

  it("preserves workout history and labels custom rows without rewriting performance", () => {
    expect(sql).toContain("set is_custom = true");
    expect(sql).toContain("canonical_exercise_id = coalesce(canonical_exercise_id, id)");
    expect(sql).not.toMatch(/update\s+public\.(exercise_sessions|sets|workout_sessions)/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.(exercises|exercise_sessions|sets|workout_sessions)/i);
  });

  it("protects library-owned identity fields and respects RLS", () => {
    expect(sql).toContain("alter table public.exercise_secondary_muscles enable row level security;");
    expect(sql).toContain("alter table public.exercise_aliases enable row level security;");
    expect(sql).toContain("with (security_invoker = true)");
    expect(sql).toContain("grant insert (name, muscle_group, equipment, is_active, created_by)");
    expect(sql).toContain("Canonical exercise identity and metadata are library-managed");
    expect(sql).toContain("new.is_custom := true;");
  });

  it("provides an RLS-safe cross-athlete grouping projection", () => {
    expect(sql).toContain("create view public.canonical_exercise_sessions");
    expect(sql).toContain("ws.athlete_user_id");
    expect(sql).toContain("coalesce(e.canonical_exercise_id,e.id) as canonical_exercise_id");
    expect(sql).toContain("grant select on public.canonical_exercise_sessions to authenticated;");
  });

  it("uses canonical standard rows for new athlete and coach template selection", () => {
    for (const editor of [athleteWorkoutEditor, coachWorkoutEditor]) {
      expect(editor).toContain("canonical_exercise_id");
      expect(editor).toContain("filter(selectableExercise)");
    }
  });
});
