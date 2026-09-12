import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { competitionAwardArt, getCompetitionAwardArt, selectLatestEarnedAward } from "./awardArt";

describe("canonical competition award artwork", () => {
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
