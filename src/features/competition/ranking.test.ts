import { describe, expect, it } from "vitest";
import { COMPETITION_SCORE_PRECISION, rankCompetitionEntries } from "./ranking";

describe("PHATBOT competition ranking", () => {
  it("ranks higher fixed-precision scores first", () => {
    const ranked = rankCompetitionEntries([
      { athleteId: "athlete-c", score: 0.1 },
      { athleteId: "athlete-a", score: 0.3 },
      { athleteId: "athlete-b", score: 0.2 },
    ]);

    expect(ranked.map((entry) => [entry.athleteId, entry.rank])).toEqual([
      ["athlete-a", 1],
      ["athlete-b", 2],
      ["athlete-c", 3],
    ]);
  });

  it("uses competition ranks for true ties", () => {
    const ranked = rankCompetitionEntries([
      { athleteId: "athlete-b", score: 0.5 },
      { athleteId: "athlete-a", score: 0.5 },
      { athleteId: "athlete-c", score: 0.4 },
    ]);

    expect(ranked.map((entry) => [entry.athleteId, entry.rank])).toEqual([
      ["athlete-a", 1],
      ["athlete-b", 1],
      ["athlete-c", 3],
    ]);
    expect(ranked.filter((entry) => entry.rank === 1).every((entry) => entry.isChampion)).toBe(true);
    expect(ranked.filter((entry) => entry.rank === 1).every((entry) => entry.isCoChampion)).toBe(true);
    expect(ranked.find((entry) => entry.rank === 3)?.isCoChampion).toBe(false);
  });

  it("does not mark a sole rank-one athlete as a co-champion", () => {
    const [winner] = rankCompetitionEntries([
      { athleteId: "winner", score: 9739 },
      { athleteId: "runner-up", score: 5798 },
    ]);

    expect(winner).toMatchObject({ rank: 1, isChampion: true, isCoChampion: false });
  });

  it("canonicalizes scores to deterministic fixed precision before ranking", () => {
    const ranked = rankCompetitionEntries([
      { athleteId: "athlete-b", score: 0.12345649 },
      { athleteId: "athlete-a", score: 0.1234564 },
      { athleteId: "athlete-c", score: 0.1234554 },
    ]);

    expect(COMPETITION_SCORE_PRECISION).toBe(6);
    expect(ranked.map((entry) => entry.fixedPrecisionScore)).toEqual([123456, 123456, 123455]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 3]);
  });

  it("uses a stable secondary display order without changing tied ranks", () => {
    const ranked = rankCompetitionEntries([
      { athleteId: "id-2", score: 100, displayOrderKey: "bravo" },
      { athleteId: "id-1", score: 100, displayOrderKey: "alpha" },
      { athleteId: "id-3", score: 90, displayOrderKey: "charlie" },
    ]);

    expect(ranked.map((entry) => entry.athleteId)).toEqual(["id-1", "id-2", "id-3"]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 3]);
  });

  it("supports three-way ties and skips to fourth place", () => {
    const ranked = rankCompetitionEntries([
      { athleteId: "c", score: 1 },
      { athleteId: "a", score: 1 },
      { athleteId: "d", score: 0.5 },
      { athleteId: "b", score: 1 },
    ]);

    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 1, 4]);
    expect(ranked.slice(0, 3).every((entry) => entry.isCoChampion)).toBe(true);
  });

  it("rejects non-finite scores and duplicate athletes", () => {
    expect(() => rankCompetitionEntries([{ athleteId: "a", score: Number.NaN }])).toThrow("finite");
    expect(() => rankCompetitionEntries([
      { athleteId: "a", score: 1 },
      { athleteId: "a", score: 0.5 },
    ])).toThrow("Duplicate competition athlete");
  });
});
