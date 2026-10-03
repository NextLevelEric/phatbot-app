import { describe, expect, it } from "vitest";
import { formatDistance, formatWeight, poAvailabilityCopy, signedValue, weeklyAnswer, type WeeklyReportPayload } from "./report";

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


describe("integrated weekly answer", () => {
  const payload = {
    progressive_overload:{status:"available",required_exercise_scores:2,persisted_exercise_scores:2,required_workout_scores:1,persisted_workout_scores:1,wins:2,neutral:0,regressions:0,average_score_percent:100},
    cardio:{sessions:1,distance_meters:5000,comparable_improvements:[{label:"5K",current_seconds:1800,previous_seconds:1860,improvement_seconds:60}]},
    bodyweight:null, sleep:{status:"partial",recorded_nights:4,average_hours:7,previous_average_hours:6.5,change_hours:.5},
    next_targets:[],workouts:{completed:3,training_days:3}
  } as unknown as WeeklyReportPayload;
  it("puts verified wins, missingness, and a next action into one answer",()=>{
    const answer=weeklyAnswer(payload);
    expect(answer.wins).toContain("2 strength progression wins recorded.");
    expect(answer.wins).toContain("1 cardio benchmark improved.");
    expect(answer.concerns[0]).toContain("4 nights recorded");
    expect(answer.actions).toHaveLength(1);
  });
});
