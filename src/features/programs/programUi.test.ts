import { describe, expect, it } from "vitest";
import {
  assignmentSourceLabel,
  buildNextProgramWorkout,
  formatPrescriptionTargets,
  formatProgramStartDate,
  minimumFutureProgramStartDate,
  programStartDateInputValue,
  reviewDateStatus,
  type NextProgramWorkoutRow,
  type ProgramAssignment,
} from "./programUi";

const assignment: ProgramAssignment = {
  assignment_id: "assignment",
  athlete_user_id: "athlete",
  program_version_id: "version",
  program_family_id: "family",
  program_name: "Full Body v1",
  program_family_name: "Full Body",
  version_number: 1,
  assignment_status: "active",
  source_type: "coach_assigned",
  assigned_by_user_id: "coach",
  assigned_by_display_name: "Eric",
  started_at: "2026-09-13T12:00:00Z",
  ended_at: null,
  review_due_at: null,
};

const row = (overrides: Partial<NextProgramWorkoutRow> = {}): NextProgramWorkoutRow => ({
  assignment_id: "assignment",
  athlete_user_id: "athlete",
  review_due_at: null,
  program_family_id: "family",
  program_family_name: "Full Body",
  program_version_id: "version",
  program_version_name: "Full Body v1",
  version_number: 1,
  program_day_id: "day-a",
  day_number: 1,
  day_name: "Full Body A",
  exercise_position: 1,
  exercise_id: "exercise",
  canonical_exercise_id: "exercise",
  exercise_display_name: "Barbell Bench Press",
  prescribed_set_targets: ["5", "8", "12", "12"],
  exercise_notes: null,
  ...overrides,
});

describe("program UI view models", () => {
  it("builds the exact authoritative next workout in exercise order", () => {
    const next = buildNextProgramWorkout([
      row({ exercise_position: 2, exercise_display_name: "Deficit Push-Up", prescribed_set_targets: ["AMRAP", "AMRAP", "AMRAP"] }),
      row(),
    ]);
    expect(next).toMatchObject({ programName: "Full Body", dayName: "Full Body A", versionNumber: 1 });
    expect(next?.exercises.map((exercise) => exercise.name)).toEqual(["Barbell Bench Press", "Deficit Push-Up"]);
  });

  it("returns a safe empty next-workout state", () => {
    expect(buildNextProgramWorkout([])).toBeNull();
  });

  it("labels coach and athlete assignment sources accurately", () => {
    expect(assignmentSourceLabel(assignment)).toBe("Assigned by Eric");
    expect(assignmentSourceLabel({ ...assignment, assigned_by_display_name: null })).toBe("Assigned by your coach");
    expect(assignmentSourceLabel({ ...assignment, source_type: "athlete_selected" })).toBe("Chosen by you");
  });

  it("treats reached review dates as attention metadata only", () => {
    expect(reviewDateStatus(null, new Date("2026-09-13T12:00:00Z"))).toEqual({ label: "No review scheduled", isDue: false });
    expect(reviewDateStatus("2026-09-12T12:00:00Z", new Date("2026-09-13T12:00:00Z"))).toEqual({ label: "Program review due", isDue: true });
    expect(reviewDateStatus("2026-09-21T12:00:00Z", new Date("2026-09-13T12:00:00Z"))).toMatchObject({ isDue: false });
  });

  it("preserves numeric, AMRAP, plus, timed, and blank prescriptions", () => {
    expect(formatPrescriptionTargets(["5", "8", "12", "12"])).toBe("5 / 8 / 12 / 12");
    expect(formatPrescriptionTargets(["AMRAP", "AMRAP", "AMRAP"])).toBe("AMRAP × 3");
    expect(formatPrescriptionTargets(["12+"])).toBe("12+");
    expect(formatPrescriptionTargets(["2 Minutes (Non consecutive)"])).toBe("2 Minutes (Non consecutive)");
    expect(formatPrescriptionTargets([""])).toBe("Targets not specified");
  });

  it("formats scheduled starts by the authoritative Eastern calendar date", () => {
    expect(formatProgramStartDate("2026-09-21T04:00:00Z")).toBe("Sep 21, 2026");
    expect(programStartDateInputValue("2026-09-21T04:00:00Z")).toBe("2026-09-21");
    expect(programStartDateInputValue("2026-11-01T04:00:00Z")).toBe("2026-11-01");
    expect(minimumFutureProgramStartDate(new Date("2026-09-14T23:30:00Z"))).toBe("2026-09-15");
    expect(minimumFutureProgramStartDate(new Date("2026-09-15T04:30:00Z"))).toBe("2026-09-16");
  });
});
