export type ProgramAssignment = {
  assignment_id: string;
  athlete_user_id: string;
  program_version_id: string;
  program_family_id: string;
  program_name: string;
  program_family_name: string;
  version_number: number;
  assignment_status: "active" | "ended";
  source_type: "coach_assigned" | "athlete_selected" | "athlete_created" | "system_migration";
  assigned_by_user_id: string | null;
  assigned_by_display_name: string | null;
  started_at: string;
  ended_at: string | null;
  review_due_at: string | null;
};

export type NextProgramWorkoutRow = {
  assignment_id: string;
  athlete_user_id: string;
  review_due_at: string | null;
  program_family_id: string;
  program_family_name: string;
  program_version_id: string;
  program_version_name: string;
  version_number: number;
  program_day_id: string;
  day_number: number;
  day_name: string;
  exercise_position: number | null;
  exercise_id: string | null;
  canonical_exercise_id: string | null;
  exercise_display_name: string | null;
  prescribed_set_targets: string[] | null;
  exercise_notes: string | null;
};

export type ProgramExercise = {
  position: number;
  name: string;
  targets: string[];
  notes: string | null;
};

export type NextProgramWorkout = {
  assignmentId: string;
  programFamilyId: string;
  programVersionId: string;
  programName: string;
  versionNumber: number;
  dayId: string;
  dayNumber: number;
  dayName: string;
  exercises: ProgramExercise[];
};

export function buildNextProgramWorkout(rows: NextProgramWorkoutRow[]): NextProgramWorkout | null {
  const first = rows[0];
  if (!first) return null;
  return {
    assignmentId: first.assignment_id,
    programFamilyId: first.program_family_id,
    programVersionId: first.program_version_id,
    programName: first.program_family_name || first.program_version_name,
    versionNumber: first.version_number,
    dayId: first.program_day_id,
    dayNumber: first.day_number,
    dayName: first.day_name,
    exercises: rows
      .filter((row) => row.exercise_id && row.exercise_display_name && row.exercise_position !== null)
      .map((row) => ({
        position: row.exercise_position as number,
        name: row.exercise_display_name as string,
        targets: row.prescribed_set_targets ?? [],
        notes: row.exercise_notes,
      }))
      .sort((a, b) => a.position - b.position),
  };
}

export function assignmentSourceLabel(assignment: ProgramAssignment) {
  if (assignment.source_type === "coach_assigned") {
    return `Assigned by ${assignment.assigned_by_display_name?.trim() || "your coach"}`;
  }
  if (assignment.source_type === "athlete_selected") return "Chosen by you";
  if (assignment.source_type === "athlete_created") return "Created by you";
  return "Assigned by PHATBOT";
}

export function reviewDateStatus(reviewDueAt: string | null, now = new Date()) {
  if (!reviewDueAt) return { label: "No review scheduled", isDue: false };
  const due = new Date(reviewDueAt);
  if (Number.isNaN(due.getTime())) return { label: "Review date unavailable", isDue: false };
  if (due.getTime() <= now.getTime()) return { label: "Program review due", isDue: true };
  return {
    label: `Review due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    isDue: false,
  };
}

export function formatAssignmentDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatPrescriptionTargets(targets: string[]) {
  if (!targets.length || targets.every((target) => target.trim() === "")) return "Targets not specified";
  const visible = targets.map((target) => target.trim() || "—");
  if (visible.length > 1 && visible.every((target) => target === visible[0])) {
    return `${visible[0]} × ${visible.length}`;
  }
  return visible.join(" / ");
}

export function friendlyProgramError(action: "load" | "assign" | "review" | "start") {
  if (action === "assign") return "PHATBOT couldn't change the program. Nothing was changed. Please try again.";
  if (action === "review") return "PHATBOT couldn't save the review date. The assignment is unchanged.";
  if (action === "start") return "PHATBOT couldn't start the next workout. Your program position is unchanged.";
  return "PHATBOT couldn't load program details. Your training data is safe.";
}
