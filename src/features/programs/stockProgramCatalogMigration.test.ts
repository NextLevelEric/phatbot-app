import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260913171833_stock_program_catalog_v1.sql";
const muscleGroupMigrationPath =
  "supabase/migrations/20260913171823_add_adductor_abductor_muscle_groups.sql";
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

function section(start: string, end: string) {
  const startIndex = sql.indexOf(start);
  const endIndex = sql.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return sql.slice(startIndex, endIndex);
}

function rowsFor(sectionSql: string, familySlug: string) {
  return [...sectionSql.matchAll(new RegExp(`\\('${familySlug}',(\\d+),`, "g"))].map(
    (match) => Number(match[1]),
  );
}

describe("stock program catalog migration", () => {
  it("extends the controlled muscle taxonomy before the catalog uses it", () => {
    const muscleGroupSql = readFileSync(muscleGroupMigrationPath, "utf8");

    expect(muscleGroupSql).toContain(
      "alter type public.exercise_muscle_group add value if not exists 'adductors'",
    );
    expect(muscleGroupSql).toContain(
      "alter type public.exercise_muscle_group add value if not exists 'abductors'",
    );
    expect(muscleGroupMigrationPath.localeCompare(migrationPath)).toBeLessThan(0);
  });

  it("creates four stock families and exactly one published rotation v1 each", () => {
    const programs = section(
      "insert into _stock_catalog_programs values",
      "create temp table _stock_catalog_days",
    );

    for (const slug of [
      "first-day-in-the-gym",
      "full-body",
      "strength-as-a-skill",
      "inaugural-eager-beaver",
    ]) {
      expect(programs).toContain(`('${slug}'`);
      expect(sql).toContain(`expected.family_slug || '-v1'`);
    }

    expect(normalized).toContain("'phatbot_stock'");
    expect(normalized).toContain("'stock_catalog'");
    expect(normalized).toContain("'rotation'");
    expect(normalized).toContain("set status = 'published'");
    expect(normalized).toContain("version_number = 1");
  });

  it("preserves exact workout counts and order", () => {
    const days = section(
      "insert into _stock_catalog_days values",
      "create temp table _stock_catalog_prescriptions",
    );

    expect(rowsFor(days, "first-day-in-the-gym")).toEqual([1, 2, 3, 4]);
    expect(rowsFor(days, "full-body")).toEqual([1, 2]);
    expect(rowsFor(days, "strength-as-a-skill")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rowsFor(days, "inaugural-eager-beaver")).toEqual([1, 2, 3, 4, 5, 6]);

    expect(days).toMatch(/'first-day-in-the-gym',1,'Beginner A'[\s\S]*'first-day-in-the-gym',4,'Beginner D'/);
    expect(days).toMatch(/'full-body',1,'Full Body A'[\s\S]*'full-body',2,'Full Body B'/);
  });

  it("collapses repeated source rows into 83 ordered set-specific prescriptions", () => {
    const prescriptions = section(
      "insert into _stock_catalog_prescriptions values",
      "create temp table _stock_catalog_new_versions",
    );
    const rows = [...prescriptions.matchAll(/^\s*\('[^']+',\d+,\d+,'/gm)];
    expect(rows).toHaveLength(83);

    const counts = new Map<string, number>();
    for (const match of prescriptions.matchAll(/^\s*\('([^']+)',(\d+),\d+,'/gm)) {
      const key = `${match[1]}:${match[2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      "inaugural-eager-beaver:1": 5,
      "inaugural-eager-beaver:2": 6,
      "inaugural-eager-beaver:3": 5,
      "inaugural-eager-beaver:4": 6,
      "inaugural-eager-beaver:5": 5,
      "inaugural-eager-beaver:6": 4,
      "first-day-in-the-gym:1": 3,
      "first-day-in-the-gym:2": 3,
      "first-day-in-the-gym:3": 3,
      "first-day-in-the-gym:4": 4,
      "strength-as-a-skill:1": 4,
      "strength-as-a-skill:2": 4,
      "strength-as-a-skill:3": 5,
      "strength-as-a-skill:4": 4,
      "strength-as-a-skill:5": 4,
      "strength-as-a-skill:6": 4,
      "full-body:1": 7,
      "full-body:2": 7,
    });
  });

  it("preserves numeric, AMRAP, plus, timed, and blank targets exactly", () => {
    expect(sql).toContain("array['3','8','12','12']");
    expect(sql).toContain("array['AMRAP','AMRAP','AMRAP']");
    expect(sql).toContain("array['12','12','15','15+']");
    expect(sql).toContain("array['2 Minutes (Non consecutive)']");
    expect(sql).toContain("array['','','','']");
    expect(sql).toContain("array['5','5','5','5','5']");
  });

  it("uses only reviewed aliases and keeps meaningful variations distinct", () => {
    expect(sql).toContain("('Barbell Squat','Barbell Back Squat'");
    expect(sql).toContain("('Dumbbell Incline Bench Press','Incline Dumbbell Bench Press'");
    expect(sql).toContain("('Seated Dumbbell Shoulder Press','Dumbbell Shoulder Press'");

    for (const canonical of [
      "Chest Fly",
      "Machine Chest Fly",
      "Plate-Loaded Chest Fly",
      "Lateral Raise",
      "Dumbbell Lateral Raise",
      "Seated Dumbbell Lateral Raise",
      "Leg Curl",
      "Seated Leg Curl",
      "Dip",
      "Assisted Dip",
      "Plate-Loaded Seated Dip",
      "Plate-Loaded Chest-Supported Row",
      "Plate-Loaded Seated Row",
    ]) {
      expect(sql).toContain(`('${canonical}'`);
    }
    expect(normalized).not.toContain("similarity(");
    expect(normalized).not.toContain("levenshtein");
  });

  it("requires complete metadata for every new standard exercise", () => {
    const canonical = section(
      "insert into _stock_catalog_canonical_exercises values",
      "insert into public.exercises",
    );
    const rows = [...canonical.matchAll(/^\s*\('[^']+',/gm)];
    expect(rows).toHaveLength(47);
    expect(normalized).toContain("canonical exercise metadata conflicts with the reviewed definition");
    expect(normalized).toContain("secondary-muscle metadata conflicts with the reviewed definition");
  });

  it("classifies the hip machines with controlled, specific primary muscles", () => {
    expect(sql).toContain(
      "('Hip Abductor Machine','Abductors','Machine','abductors','isolation','machine','isolation','bilateral','seated')",
    );
    expect(sql).toContain(
      "('Hip Adductor Machine','Adductors','Machine','adductors','isolation','machine','isolation','bilateral','seated')",
    );

    const secondaryMuscles = section(
      "insert into _stock_catalog_secondary_muscles values",
      "insert into public.exercise_secondary_muscles",
    );
    expect(secondaryMuscles).not.toContain("Hip Abductor Machine");
    expect(secondaryMuscles).not.toContain("Hip Adductor Machine");
  });

  it("is idempotent without mutating published versions or Smooth Bear", () => {
    expect(normalized).toContain("on conflict (slug) do nothing");
    expect(normalized).toContain("where not exists ( select 1 from public.training_programs existing");
    expect(normalized).toContain("join _stock_catalog_new_versions");
    expect(normalized).toContain("existing stock program v1 conflicts with the reviewed catalog");
    expect(normalized).toContain("existing stock program exercise prescriptions conflict with the source workbooks");
    expect(normalized).not.toMatch(/update public\.training_programs[^;]+smooth-bear-current-meso-1/);
  });

  it("does not assign athletes or change enrollment and sequencing behavior", () => {
    expect(normalized).not.toContain("insert into public.athlete_program_enrollments");
    expect(normalized).not.toContain("insert into public.athlete_program_workouts");
    expect(normalized).not.toContain("insert into public.workouts");
    expect(normalized).not.toContain("insert into public.workout_exercises");
    expect(normalized).not.toContain("update public.exercise_sessions");
    expect(normalized).not.toContain("update public.workout_sessions");
  });
});
