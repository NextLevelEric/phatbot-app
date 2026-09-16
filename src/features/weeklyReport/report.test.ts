import { describe, expect, it } from "vitest";
import { formatDistance, formatWeight, poAvailabilityCopy, signedValue } from "./report";

describe("weekly report presentation helpers", () => {
  it("distinguishes incomplete score coverage from no progress", () => {
    expect(poAvailabilityCopy("incomplete")).toContain("authoritative workout scores are still missing");
    expect(poAvailabilityCopy("incomplete")).not.toContain("no progress");
  });

  it("explains baseline-only and quiet weeks without judgment", () => {
    expect(poAvailabilityCopy("baseline_only")).toContain("established new exercise baselines");
    expect(poAvailabilityCopy("not_applicable")).toContain("No eligible completed workouts");
  });

  it("formats factual signed changes, weights, and cardio distance", () => {
    expect(signedValue(2.34)).toBe("+2.3");
    expect(signedValue(-0.84)).toBe("-0.8");
    expect(formatWeight(223.84, "lb")).toBe("223.8 lb");
    expect(formatDistance(5000)).toBe("3.1 mi");
  });
});
