export type ProgramLaunchRow = {
  id: string;
  program_id: string;
  launch_at: string;
  status: "active" | "inactive";
  headline: string | null;
  summary: string | null;
  training_programs?: {
    name: string;
    program_families: { name: string } | Array<{ name: string }> | null;
  } | Array<{
    name: string;
    program_families: { name: string } | Array<{ name: string }> | null;
  }> | null;
};

export type VisibleProgramLaunch = ProgramLaunchRow & {
  launchAt: Date;
};

export function selectCurrentProgramLaunch(
  rows: ProgramLaunchRow[],
  now = new Date(),
): VisibleProgramLaunch | null {
  const visible = rows
    .map((row) => ({ ...row, launchAt: new Date(row.launch_at) }))
    .filter((row) => (
      row.status === "active"
      && !Number.isNaN(row.launchAt.getTime())
      && row.launchAt.getTime() <= now.getTime()
    ))
    .sort((left, right) => (
      right.launchAt.getTime() - left.launchAt.getTime()
      || left.id.localeCompare(right.id)
    ));

  return visible[0] ?? null;
}

export function programLaunchName(launch: ProgramLaunchRow) {
  const version = Array.isArray(launch.training_programs)
    ? launch.training_programs[0] ?? null
    : launch.training_programs ?? null;
  const family = Array.isArray(version?.program_families)
    ? version.program_families[0] ?? null
    : version?.program_families ?? null;
  return family?.name || version?.name || "PHATBOT Program";
}

export function isFeaturedProgram(
  programId: string,
  launch: Pick<ProgramLaunchRow, "program_id"> | null,
) {
  return launch?.program_id === programId;
}

export type ProgramHomeState = "active_assignment" | "scheduled_assignment" | "launch" | "self_directed";

export function programHomeState(input: {
  hasActiveAssignment: boolean;
  hasScheduledAssignment: boolean;
  hasVisibleLaunch: boolean;
}): ProgramHomeState {
  if (input.hasActiveAssignment) return "active_assignment";
  if (input.hasScheduledAssignment) return "scheduled_assignment";
  if (input.hasVisibleLaunch) return "launch";
  return "self_directed";
}
