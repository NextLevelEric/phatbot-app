import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { competitionAwardArt, weeklyCompetitionAwardArt, getAwardArt, getCompetitionAwardArt, selectLatestEarnedAward } from "./awardArt";
import { buildCompetitionShareContent } from "./share";

describe("canonical competition award artwork", () => {
  it("labels weekly share hardware platinum while preserving daily share names", () => {
    const input = { competition: "eager_beaver" as const, athleteName: "Athlete", result: "10", rank: 1, finalized: true, mode: "award" as const };
    expect(buildCompetitionShareContent({ ...input, cadence: "weekly" }).hero).toBe("PLATINUM LOG");
    expect(buildCompetitionShareContent({ ...input, cadence: "daily" }).hero).toBe("GOLDEN LOG");
  });
  it.each([
    ["beast", "beast"], ["eager_beaver", "eager-beaver"],
    ["cardio_bunny", "cardio-bunny"], ["step_king", "step-king"],
  ] as const)("resolves historical and future weekly %s without changing records", (competition, filename) => {
    const award = Object.freeze({ id: "historical-award", period_start: "2026-09-06", competition, cadence: "weekly" as const });
    const before = JSON.stringify(award);
    expect(getAwardArt(award).src).toBe(`/competition-awards/${filename}-of-the-week-platinum.png`);
    expect(getAwardArt({ competition, cadence: "weekly" })).toEqual(weeklyCompetitionAwardArt[competition]);
    expect(getAwardArt({ competition, cadence: "daily" })).toBe(competitionAwardArt[competition]);
    expect(JSON.stringify(award)).toBe(before);
    const bytes = readFileSync(join(process.cwd(), "public", getAwardArt(award).src));
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  });
  it("maps every award to its official semantic asset", () => {
    expect(competitionAwardArt).toEqual({
      beast: expect.objectContaining({ src: "/competition-awards/beast-medallion.png" }),
      eager_beaver: expect.objectContaining({ src: "/competition-awards/eager-beaver-golden-log.png" }),
      cardio_bunny: expect.objectContaining({ src: "/competition-awards/cardio-bunny-golden-carrot.png" }),
      step_king: expect.objectContaining({ src: "/competition-awards/step-king-crown.png" }),
    });
    expect(getCompetitionAwardArt("eager_beaver").alt).toContain("Golden Log");
    expect(getCompetitionAwardArt("cardio_bunny").alt).toContain("Golden Carrot");
    expect(getCompetitionAwardArt("step_king").alt).toContain("crown");
    expect(getCompetitionAwardArt("beast").alt).toContain("medallion");
    for (const artwork of Object.values(competitionAwardArt)) {
      const path = join(process.cwd(), "public", artwork.src.replace(/^\//, ""));
      expect(existsSync(path), `${artwork.src} should exist`).toBe(true);
      expect(readFileSync(path).subarray(1, 4).toString("ascii")).toBe("PNG");
    }
  });

  it("selects an earned cabinet item as the share target", () => {
    const older = { id: "older", competition: "beast" as const };
    const latest = { id: "latest", competition: "eager_beaver" as const };
    expect(selectLatestEarnedAward([latest, older], "eager_beaver")).toBe(latest);
  });

  it("does not create a share target for zero-count hardware", () => {
    expect(selectLatestEarnedAward([{ id: "earned", competition: "beast" as const }], "step_king")).toBeNull();
  });
});
