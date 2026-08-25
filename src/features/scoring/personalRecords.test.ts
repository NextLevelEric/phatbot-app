import { describe, expect, it } from "vitest";
import { detectPersonalRecords } from "./personalRecords";

describe("PHATBOT personal records", () => {
  it("classifies a new heaviest weight as a true PR", () => {
    const records = detectPersonalRecords(
      [{ weight: 200, reps: 3, setType: "working" }],
      [{ weight: 195, reps: 5, setType: "working" }],
    );

    expect(records).toContainEqual(
      expect.objectContaining({
        type: "heaviest_weight",
        classification: "true_pr",
        weight: 200,
        reps: 3,
        previousWeight: 195,
      }),
    );
  });

  it("classifies more reps at an existing weight as a weight milestone, not a true PR", () => {
    const records = detectPersonalRecords(
      [{ weight: 160, reps: 5, setType: "working" }],
      [
        { weight: 160, reps: 4, setType: "working" },
        { weight: 200, reps: 8, setType: "working" },
      ],
    );

    expect(records).toContainEqual(
      expect.objectContaining({
        type: "best_at_weight",
        classification: "weight_milestone",
        weight: 160,
        reps: 5,
        previousReps: 4,
      }),
    );
    expect(records.some((record) => record.classification === "true_pr")).toBe(false);
  });

  it("does not create a milestone when the athlete has already done more reps at that weight", () => {
    const records = detectPersonalRecords(
      [{ weight: 160, reps: 5, setType: "working" }],
      [
        { weight: 160, reps: 8, setType: "working" },
        { weight: 200, reps: 8, setType: "working" },
      ],
    );

    expect(records).toHaveLength(0);
  });

  it("can report both a true weight PR and a best-at-weight milestone from different sets", () => {
    const records = detectPersonalRecords(
      [
        { weight: 205, reps: 3, setType: "top" },
        { weight: 185, reps: 10, setType: "backoff" },
      ],
      [
        { weight: 200, reps: 5, setType: "working" },
        { weight: 185, reps: 8, setType: "working" },
      ],
    );

    expect(records.some((record) => record.classification === "true_pr" && record.weight === 205)).toBe(true);
    expect(records.some((record) => record.classification === "weight_milestone" && record.weight === 185)).toBe(true);
  });

  it("does not count warmups as PRs", () => {
    const records = detectPersonalRecords(
      [
        { weight: 300, reps: 1, setType: "warmup" },
        { weight: 185, reps: 7, setType: "working" },
      ],
      [{ weight: 190, reps: 5, setType: "working" }],
    );

    expect(records).toHaveLength(0);
  });

  it("does not count drop, tempo, or timed work as lifting PRs", () => {
    const records = detectPersonalRecords(
      [
        { weight: 250, reps: 12, setType: "drop" },
        { weight: 225, reps: 10, setType: "tempo" },
        { weight: 0, reps: 210, setType: "timed" },
      ],
      [{ weight: 200, reps: 8, setType: "working" }],
    );

    expect(records).toHaveLength(0);
  });
});
