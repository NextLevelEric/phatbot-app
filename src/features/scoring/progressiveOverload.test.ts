import { describe, expect, it } from "vitest";
import { scoreExercisePerformance, type PerformanceSet } from "./progressiveOverload";

const set = (weight: number, reps: number, partialReps = 0, setType: PerformanceSet["setType"] = "working"): PerformanceSet => ({ weight, reps, partialReps, setType });
const score = (current: PerformanceSet[], previous: PerformanceSet[], notes?: string) => scoreExercisePerformance({ sets: current, notes }, { sets: previous });

describe("PHATBOT progressive overload rules", () => {
  it("counts a heavier load for 3 reps as progression even when reps fall", () => {
    expect(score([set(100, 3)], [set(95, 5)]).score).toBe(1);
  });

  it("treats a heavier load under 3 reps as neutral", () => {
    expect(score([set(100, 2)], [set(95, 5)]).score).toBe(0.5);
  });

  it("counts more reps at the same weight as progression", () => {
    expect(score([set(95, 6)], [set(95, 5)]).score).toBe(1);
  });

  it("counts added partials after matching full reps as progression", () => {
    expect(score([set(95, 5, 2)], [set(95, 5, 0)]).score).toBe(1);
  });

  it("scores matching performance as neutral", () => {
    expect(score([set(95, 5)], [set(95, 5)]).score).toBe(0.5);
  });

  it("scores fewer reps at the same weight as regression without a quality note", () => {
    expect(score([set(95, 4)], [set(95, 5)]).score).toBe(0);
  });

  it("protects fewer reps from regression when the athlete improved form", () => {
    const result = score([set(95, 4)], [set(95, 5)], "Improved my form and controlled the reps better");
    expect(result.score).toBe(0.5);
    expect(result.result).toBe("neutral");
    expect(result.explanationCode).toBe("fewer_reps_improved_quality");
  });

  it("protects a lower weight from regression when time under tension improved", () => {
    const result = score([set(85, 8)], [set(95, 8)], "Slowed down to improve my time under tension");
    expect(result.score).toBe(0.5);
    expect(result.result).toBe("neutral");
    expect(result.explanationCode).toBe("lower_weight_improved_quality");
  });

  it("still rewards matching numbers with improved execution as progression", () => {
    const result = score([set(95, 5)], [set(95, 5)], "Better range of motion today");
    expect(result.score).toBe(1);
    expect(result.result).toBe("progression");
  });

  it("ignores warmups when choosing the best comparable set", () => {
    const result = score([set(200, 1, 0, "warmup"), set(100, 6)], [set(190, 1, 0, "warmup"), set(100, 5)]);
    expect(result.score).toBe(1);
    expect(result.currentBest?.weight).toBe(100);
  });

  it("returns baseline when there is no prior comparable performance", () => {
    const result = scoreExercisePerformance({ sets: [set(95, 5)] }, null);
    expect(result.result).toBe("baseline");
    expect(result.score).toBe(0.5);
  });
});