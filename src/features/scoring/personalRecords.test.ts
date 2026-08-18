import { describe, expect, it } from "vitest";
import { detectPersonalRecords } from "./personalRecords";

describe("PHATBOT personal records", () => {
  it("detects a new heaviest weight", () => {
    const records = detectPersonalRecords(
      [{ weight: 200, reps: 3, setType: "working" }],
      [{ weight: 195, reps: 5, setType: "working" }],
    );
    expect(records.some((record) => record.type === "heaviest_weight")).toBe(true);
  });

  it("detects a rep PR at an existing weight", () => {
    const records = detectPersonalRecords(
      [{ weight: 185, reps: 8, setType: "working" }],
      [{ weight: 185, reps: 7, setType: "working" }],
    );
    expect(records.some((record) => record.type === "matched_load_reps")).toBe(true);
  });

  it("does not count warmups as PRs", () => {
    const records = detectPersonalRecords(
      [{ weight: 300, reps: 1, setType: "warmup" }, { weight: 185, reps: 7, setType: "working" }],
      [{ weight: 190, reps: 5, setType: "working" }],
    );
    expect(records).toHaveLength(0);
  });
});
