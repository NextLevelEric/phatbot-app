import { describe, expect, it } from "vitest";
import { formatBodyweight, newestBodyweightMeasurement, validateBodyweightInput } from "./bodyweight";

describe("bodyweight entry", () => {
  it("accepts decimal pounds and kilograms", () => {
    expect(validateBodyweightInput("222.4", "lb")).toEqual({ valid: true, value: 222.4 });
    expect(validateBodyweightInput("82.75", "kg")).toEqual({ valid: true, value: 82.75 });
  });

  it("rejects empty, malformed, overly precise, and impossible values", () => {
    expect(validateBodyweightInput("", "lb")).toMatchObject({ valid: false });
    expect(validateBodyweightInput("abc", "lb")).toMatchObject({ valid: false });
    expect(validateBodyweightInput("222.456", "lb")).toMatchObject({ valid: false });
    expect(validateBodyweightInput("39.9", "lb")).toEqual({ valid: false, message: "Enter a weight between 40 and 1000 lb." });
    expect(validateBodyweightInput("455", "kg")).toEqual({ valid: false, message: "Enter a weight between 18 and 454 kg." });
  });

  it("formats the recorded value in its original unit", () => {
    expect(formatBodyweight(222.4, "lb")).toBe("222.4 lb");
  });

  it("retrieves the latest measurement without removing same-day history", () => {
    const entries = [
      { id: "morning", measured_at: "2026-09-12T11:00:00Z", created_at: "2026-09-12T11:00:00Z" },
      { id: "evening", measured_at: "2026-09-12T23:00:00Z", created_at: "2026-09-12T23:00:00Z" },
      { id: "yesterday", measured_at: "2026-09-11T23:00:00Z", created_at: "2026-09-11T23:00:00Z" },
    ];
    expect(entries).toHaveLength(3);
    expect(newestBodyweightMeasurement(entries)?.id).toBe("evening");
  });

  it("returns an empty state when no measurement exists", () => {
    expect(newestBodyweightMeasurement([])).toBeNull();
  });
});
