import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\s+/g, " ").toLowerCase();
const home = read("src/components/AthleteProgramHomeCard.tsx");
const homePage = read("src/app/page.tsx");
const catalog = read("src/app/programs/page.tsx");
const preview = read("src/app/programs/[programId]/page.tsx");
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

  it("previews before using authoritative athlete selection and preserves history", () => {
    expect(catalog).toContain('href={`/programs/${program.id}`}');
    expect(catalog).not.toContain('rpc("assign_program_to_athlete"');
    expect(preview).toContain('rpc("assign_program_to_athlete"');
    expect(preview).toContain('p_source_type: "athlete_selected"');
    expect(preview).toContain("your workout history will be preserved");
    expect(preview).toContain("switch programs?");
  });

  it("lets coach-assigned athletes browse and voluntarily switch", () => {
    expect(catalog).toContain('active.source_type === "coach_assigned"');
    expect(catalog).toContain("you can still choose another program");
    expect(catalog).not.toContain("coach managed");
    expect(preview).not.toContain('active?.source_type === "coach_assigned"');
  });

  it("keeps scheduled coach assignments visible and does not expose cancellation", () => {
    expect(catalog).toContain('assignment_status === "scheduled"');
    expect(catalog).toContain("will not cancel this scheduled assignment");
    expect(preview).toContain("will remain scheduled");
    expect(`${catalog} ${preview}`).not.toContain("cancel_scheduled_program_for_athlete");
  });

  it("loads visible launches without creating assignments on Home or preview", () => {
    expect(home).toContain('.from("program_launches")');
    expect(home).toContain("programhomestate");
    expect(home).not.toContain('rpc("assign_program_to_athlete"');
    expect(preview).not.toContain("useeffect(() => { rpc(");
  });

  it("keeps legacy coach-imported workout access intact", () => {
    expect(homePage).toContain("assigned by your coach");
    expect(homePage).toContain("imported by coach");
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
    const combined = `${home} ${catalog} ${preview} ${detail} ${coach}`;
    expect(combined).not.toContain("next_program_day_id");
    expect(combined).not.toContain("program_sequence_advanced_at");
  });
});
