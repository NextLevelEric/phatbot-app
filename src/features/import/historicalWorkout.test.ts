import { describe, expect, it } from "vitest";
import { parseHistoricalSheet, parsePerformanceCell, parseWorkoutDate } from "./historicalWorkout";

describe("historical workout performance parser",()=>{
  it("parses weight, reps, and partials",()=>{expect(parsePerformanceCell("245*2+1")).toEqual([{weight:245,reps:2,partialReps:1,source:"245*2+1",setType:"working",durationSeconds:null}]);});
  it("splits chained drop/backoff work into separate performances",()=>{expect(parsePerformanceCell("160*5+120*5+80*7").map(s=>[s.weight,s.reps,s.partialReps])).toEqual([[160,5,0],[120,5,0],[80,7,0]]);});
  it("handles assisted loads in parentheses",()=>{expect(parsePerformanceCell("0*2+(-100*8)+(-140*8").map(s=>[s.weight,s.reps])).toEqual([[0,2],[-100,8],[-140,8]]);});
  it("treats rep-only historical entries as bodyweight",()=>{expect(parsePerformanceCell("12")).toEqual([{weight:0,reps:12,partialReps:0,source:"12",setType:"working",durationSeconds:null}]);expect(parsePerformanceCell("10+2")).toEqual([{weight:0,reps:10,partialReps:2,source:"10+2",setType:"working",durationSeconds:null}]);});
  it("parses timed historical entries",()=>{expect(parsePerformanceCell(":39")[0]).toMatchObject({setType:"timed",durationSeconds:39});expect(parsePerformanceCell("0:39")[0]).toMatchObject({setType:"timed",durationSeconds:39});expect(parsePerformanceCell("2:30")[0]).toMatchObject({setType:"timed",durationSeconds:150});expect(parsePerformanceCell("00:02:30")[0]).toMatchObject({setType:"timed",durationSeconds:150});});
  it("ignores skipped and incomplete cells",()=>{expect(parsePerformanceCell("-")).toEqual([]);expect(parsePerformanceCell("275*")).toEqual([]);});
});

describe("historical workout dates",()=>{
  it("parses natural workout date headers",()=>expect(parseWorkoutDate("August 10th",2026)).toBe("2026-08-10"));
  it("parses ISO-style sheet dates",()=>expect(parseWorkoutDate("2026-07-15 00:00:00",2026)).toBe("2026-07-15"));
});

describe("historical sheet",()=>{
  it("turns dated columns into completed workout previews and groups repeated exercise rows",()=>{
    const rows=[[],[],[],["Excercise","This Week - Weight*Reps+Lengthened Partials","August 10th","August 3rd","Target Reps","Notes"],["Bench","245*2+1","245*2+1","240*2+1","3",""] ,["Bench","225*5","225*5","225*4+1","8","Form improvements"],["Pushups","0*10","11","10","AMRAP",""]];
    const workouts=parseHistoricalSheet("Day 1 (Push)",rows,2026);
    expect(workouts).toHaveLength(2);
    expect(workouts[0].date).toBe("2026-08-10");
    expect(workouts[0].exercises[0].name).toBe("Bench");
    expect(workouts[0].exercises[0].sets).toHaveLength(2);
    expect(workouts[0].exercises[0].notes).toBe("Form improvements");
    expect(workouts[0].exercises[1].sets[0]).toMatchObject({weight:0,reps:11});
  });
});
