import { describe, expect, it } from "vitest";
import { scoreExercisePerformance, type ExercisePerformance } from "./progressiveOverload";
import { detectPersonalRecords, type PRSet } from "./personalRecords";
import { calculateStrengthChange } from "./strengthChange";

const perf = (weight:number,reps:number,partialReps=0,notes?:string):ExercisePerformance => ({
  sets:[{weight,reps,partialReps,setType:"working"}],notes,
});

describe("progressive overload scoring",()=>{
  it("uses baseline when there is no prior performance",()=>{
    const result=scoreExercisePerformance(perf(100,8),null);
    expect(result.result).toBe("baseline");
    expect(result.explanationCode).toBe("first_comparable_performance");
  });

  it("counts a heavier load for at least three reps as progression",()=>{
    const result=scoreExercisePerformance(perf(110,3),perf(100,8));
    expect(result.result).toBe("progression");
    expect(result.score).toBe(1);
  });

  it("keeps heavier work under three reps neutral",()=>{
    const result=scoreExercisePerformance(perf(110,2),perf(100,8));
    expect(result.result).toBe("neutral");
    expect(result.explanationCode).toBe("higher_weight_under_three_reps");
  });

  it("counts more reps at the same weight as progression",()=>{
    expect(scoreExercisePerformance(perf(100,9),perf(100,8)).result).toBe("progression");
  });

  it("counts added partials after matching full reps as progression",()=>{
    const result=scoreExercisePerformance(perf(100,8,2),perf(100,8,0));
    expect(result.result).toBe("progression");
    expect(result.explanationCode).toBe("same_weight_reps_more_partials");
  });

  it("protects an intentional form improvement when load drops",()=>{
    const result=scoreExercisePerformance(perf(90,8,0,"Dropped weight to improve my form and control"),perf(100,8));
    expect(result.result).toBe("neutral");
    expect(result.explanationCode).toBe("lower_weight_improved_quality");
  });

  it("treats a skipped exercise as unscored baseline",()=>{
    const result=scoreExercisePerformance({sets:[]},perf(100,8));
    expect(result.result).toBe("baseline");
    expect(result.explanationCode).toBe("no_scored_work_set");
  });
});

describe("personal record detection",()=>{
  const s=(weight:number,reps:number,setType="working"):PRSet=>({weight,reps,setType});

  it("detects a new heaviest load",()=>{
    const prs=detectPersonalRecords([s(225,5)],[s(215,6),s(205,8)]);
    expect(prs.some(pr=>pr.type==="heaviest_weight"&&pr.weight===225)).toBe(true);
  });

  it("detects a matched-load rep PR separately",()=>{
    const prs=detectPersonalRecords([s(185,10)],[s(185,8),s(195,4)]);
    expect(prs.some(pr=>pr.type==="best_at_weight"&&pr.previousReps===8&&pr.reps===10)).toBe(true);
  });

  it("ignores warmups for PR detection",()=>{
    const prs=detectPersonalRecords([s(315,1,"warmup")],[s(225,5)]);
    expect(prs).toEqual([]);
  });
});

describe("strength change",()=>{
  it("uses only comparable exercises and excludes warmups",()=>{
    const result=calculateStrengthChange(
      [{exerciseId:"bench",sets:[{weight:45,reps:10,setType:"warmup"},{weight:200,reps:5,setType:"working"}]},{exerciseId:"row",sets:[{weight:100,reps:10,setType:"working"}]}],
      [{exerciseId:"bench",sets:[{weight:45,reps:10,setType:"warmup"},{weight:190,reps:5,setType:"working"}]}],
    );
    expect(result.currentLiftTotal).toBe(1000);
    expect(result.previousLiftTotal).toBe(950);
    expect(result.comparableExerciseCount).toBe(1);
    expect(result.percentageChange).toBeCloseTo(5.263,2);
  });
});
