import { describe, expect, it } from "vitest";
import { isFeaturedProgram, programHomeState, programLaunchName, selectCurrentProgramLaunch, type ProgramLaunchRow } from "./programLaunch";

const strengthLaunch: ProgramLaunchRow = {
  id: "launch-strength",
  program_id: "program-strength",
  launch_at: "2026-09-21T04:00:00.000Z",
  status: "active",
  headline: "New program available",
  summary: "The next training block is here.",
};

describe("program launch visibility", () => {
  it("does not expose the launch before midnight September 21 Eastern", () => {
    expect(selectCurrentProgramLaunch(
      [strengthLaunch],
      new Date("2026-09-21T03:59:59.999Z"),
    )).toBeNull();
  });

  it("exposes the launch exactly at midnight September 21 Eastern", () => {
    expect(selectCurrentProgramLaunch(
      [strengthLaunch],
      new Date("2026-09-21T04:00:00.000Z"),
    )?.program_id).toBe("program-strength");
  });

  it("ignores inactive and malformed launches and selects the latest visible launch", () => {
    const current = selectCurrentProgramLaunch([
      strengthLaunch,
      { ...strengthLaunch, id: "inactive", launch_at: "2026-09-22T04:00:00.000Z", status: "inactive" },
      { ...strengthLaunch, id: "bad-date", launch_at: "not-a-date" },
      { ...strengthLaunch, id: "latest", program_id: "program-latest", launch_at: "2026-09-23T04:00:00.000Z" },
    ], new Date("2026-09-24T12:00:00.000Z"));

    expect(current?.id).toBe("latest");
  });

  it("marks only the launched immutable program version as featured", () => {
    expect(isFeaturedProgram("program-strength", strengthLaunch)).toBe(true);
    expect(isFeaturedProgram("program-other", strengthLaunch)).toBe(false);
    expect(isFeaturedProgram("program-strength", null)).toBe(false);
  });

  it("derives display copy from authoritative program metadata", () => {
    expect(programLaunchName({
      ...strengthLaunch,
      training_programs: {
        name: "Strength as a Skill v1",
        program_families: { name: "Strength as a Skill" },
      },
    })).toBe("Strength as a Skill");
  });

  it("keeps authoritative active and scheduled assignments ahead of a generic launch", () => {
    expect(programHomeState({ hasActiveAssignment: true, hasScheduledAssignment: false, hasVisibleLaunch: true })).toBe("active_assignment");
    expect(programHomeState({ hasActiveAssignment: false, hasScheduledAssignment: true, hasVisibleLaunch: true })).toBe("scheduled_assignment");
  });

  it("shows a launch only to a self-directed athlete after it is visible", () => {
    expect(programHomeState({ hasActiveAssignment: false, hasScheduledAssignment: false, hasVisibleLaunch: true })).toBe("launch");
    expect(programHomeState({ hasActiveAssignment: false, hasScheduledAssignment: false, hasVisibleLaunch: false })).toBe("self_directed");
  });
});
