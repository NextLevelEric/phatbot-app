import { describe, expect, it } from "vitest";
import { buildCompetitionShareContent, canShareAthleteCompetition, resolveLeaderboardIdentity } from "./share";

const base = { competition: "beast" as const, athleteName: "Smooth Bear", result: "+6.2% volume", rank: 2 };

describe("competition share payloads", () => {
  it("builds a provisional live Daily standing", () => {
    expect(buildCompetitionShareContent({ ...base, cadence: "daily", finalized: false })).toMatchObject({
      heading: "BEAST · TODAY",
      hero: "#2",
      status: "LIVE STANDING",
      note: "Subject to change until close",
    });
  });

  it("builds a provisional live Weekly standing", () => {
    expect(buildCompetitionShareContent({ ...base, cadence: "weekly", finalized: false })).toMatchObject({
      heading: "BEAST · THIS WEEK",
      hero: "#2",
      status: "LIVE STANDING",
    });
  });

  it("does not describe a reconciling result as live until close", () => {
    expect(buildCompetitionShareContent({ ...base, cadence: "daily", finalized: false, periodState: "reconciling" })).toMatchObject({
      status: "PENDING FINALIZATION",
      note: "Subject to change until finalized",
    });
  });

  it("builds a finalized non-winning placement", () => {
    expect(buildCompetitionShareContent({ ...base, cadence: "daily", rank: 3, finalized: true })).toMatchObject({
      hero: "FINISHED #3",
      status: "FINAL PLACEMENT",
      note: "Official result",
    });
  });

  it("builds a finalized winner and tied co-winner without breaking the tie", () => {
    expect(buildCompetitionShareContent({ ...base, cadence: "weekly", rank: 1, finalized: true })).toMatchObject({ hero: "FINISHED #1" });
    expect(buildCompetitionShareContent({ ...base, cadence: "weekly", rank: 1, finalized: true, mode: "award", coWinner: false })).toMatchObject({ hero: "BEAST OF THE WEEK" });
    expect(buildCompetitionShareContent({ ...base, cadence: "weekly", rank: 1, finalized: true, mode: "award", coWinner: true })).toMatchObject({
      hero: "CO-BEAST OF THE WEEK",
      status: "SHARED FIRST · HARDWARE EARNED",
    });
  });

  it("uses a privacy-safe leaderboard identity", () => {
    expect(resolveLeaderboardIdentity({ mode: "private", profileName: "Private Name", customName: "Alias" })).toBe("PHATBOT Athlete");
    expect(resolveLeaderboardIdentity({ mode: "custom", profileName: "Private Name", customName: "Smooth Bear" })).toBe("Smooth Bear");
    expect(resolveLeaderboardIdentity({ mode: "profile", profileName: "Eric Parent", customName: null })).toBe("Eric Parent");
  });

  it("does not authorize shares for another athlete or an unranked athlete", () => {
    expect(canShareAthleteCompetition({ isMine: false, rank: 1 })).toBe(false);
    expect(canShareAthleteCompetition({ isMine: true, rank: null })).toBe(false);
    expect(canShareAthleteCompetition({ isMine: true, rank: 4 })).toBe(true);
  });
});
