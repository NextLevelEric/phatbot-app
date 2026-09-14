import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\s+/g, " ").toLowerCase();
const home = read("src/components/AthleteProgramHomeCard.tsx");
const homePage = read("src/app/page.tsx");
const catalog = read("src/app/programs/page.tsx");
const detail = read("src/app/programs/current/page.tsx");
const coach = read("src/components/CoachAthleteProgramSection.tsx");
const workoutsLayout = read("src/app/workouts/layout.tsx");

describe("program management UI integration", () => {
  it("shows the active assignment and exact next workout on Home", () => {
    expect(home).toContain("get_athlete_program_assignments");
    expect(home).toContain("get_next_program_workout");
    expect(home).toContain("your program");
    expect(home).toContain("next workout");
    expect(home).toContain('assignment_status === "scheduled"');
    expect(home).toContain("new program starts");
  });

  it("starts through the authoritative RPC and resumes an active workout", () => {
    expect(home).toContain('rpc("start_my_next_program_workout")');
    expect(home).toContain("/sessions/${data}");
    expect(homePage).toContain("resume phatbot train");
    expect(home).toContain("is in progress");
    expect(home).not.toContain('.from("workout_sessions").insert');
  });

  it("offers a safe optional-program empty state and preserves custom workouts", () => {
    expect(home).toContain("choose your program");
    expect(home).toContain("browse programs");
    expect(home).toContain("create / use my own workouts");
    expect(catalog).toContain("use or create my own workouts");
  });

  it("loads only active published stock catalog entries for athlete selection", () => {
    expect(catalog).toContain('.eq("program_families.source_type", "phatbot_stock")');
    expect(catalog).toContain('.eq("program_families.visibility", "stock_catalog")');
    expect(catalog).toContain('.eq("program_families.status", "active")');
    expect(catalog).toContain('.eq("status", "published")');
    expect(catalog).toContain("program_families!inner");
    expect(catalog).not.toContain("first day in the gym\",");
  });

  it("uses authoritative athlete selection and confirms history-preserving switches", () => {
    expect(catalog).toContain('rpc("assign_program_to_athlete"');
    expect(catalog).toContain('p_source_type: "athlete_selected"');
    expect(catalog).toContain("your current program history will be preserved");
    expect(catalog).toContain("your new program starts at its first workout");
  });

  it("treats coach-assigned programs as coach managed", () => {
    expect(catalog).toContain('active?.source_type === "coach_assigned"');
    expect(catalog).toContain("coach managed");
  });

  it("shows rotation, next-day highlight, prescriptions, and assignment history", () => {
    expect(detail).toContain("training_program_days");
    expect(detail).toContain("training_program_exercises");
    expect(detail).toContain("day.id === next?.dayid");
    expect(detail).toContain("formatprescriptiontargets");
    expect(detail).toContain("assignment history");
    expect(detail).toContain('assignment_status === "scheduled"');
    expect(detail).toContain("up next");
  });

  it("lets a coach assign, schedule or clear review, and view history without table writes", () => {
    expect(coach).toContain('p_source_type: "coach_assigned"');
    expect(coach).toContain('rpc("set_program_assignment_review_due_at"');
    expect(coach).toContain("no review");
    expect(coach).toContain("view history");
    expect(coach).toContain('rpc("schedule_program_for_athlete"');
    expect(coach).toContain('rpc("cancel_scheduled_program_for_athlete"');
    expect(coach).toContain("schedule next program");
    expect(coach).toContain("change scheduled program");
    expect(coach).not.toContain('.from("athlete_program_enrollments").update');
    expect(coach).not.toContain('.from("athlete_program_enrollments").insert');
  });

  it("removes the legacy Eric enrollment card from the workout list", () => {
    expect(workoutsLayout).not.toContain("ericcurrentprogramcard");
  });

  it("never changes sequencing from program management UI", () => {
    const combined = `${home} ${catalog} ${detail} ${coach}`;
    expect(combined).not.toContain("next_program_day_id");
    expect(combined).not.toContain("program_sequence_advanced_at");
  });
});
