import { describe, expect, it } from "vitest";
import { parseTemplateRows } from "./workoutTemplate";

describe("PHATBOT workout template import",()=>{
  it("groups repeated spreadsheet rows into exercise sets",()=>{
    const workout=parseTemplateRows("Day 1 (Push)",[
      [],[],[],
      ["Excercise","This Week - Weight*Reps+Lengthened Partials","Target Reps","Notes"],
      ["Flat barbell bench press","",3,""],
      ["Flat barbell bench press","",8,"Form improvements"],
      ["Flat barbell bench press","",12,""],
      ["Deficit pushups","","AMRAP",""]
    ]);
    expect(workout?.name).toBe("Day 1 (Push)");
    expect(workout?.exercises).toHaveLength(2);
    expect(workout?.exercises[0].sets.map(s=>s.targetReps)).toEqual(["3","8","12"]);
    expect(workout?.exercises[0].notes).toBe("Form improvements");
    expect(workout?.exercises[1].sets[0].targetReps).toBe("AMRAP");
  });

  it("accepts the correctly spelled Exercise header too",()=>{
    const workout=parseTemplateRows("Day 5 (Quads)",[["Exercise","This Week","Target Reps","Notes"],["RDLS","",8,""]]);
    expect(workout?.exercises[0].name).toBe("RDLS");
  });

  it("ignores non-workout tabs without a recognizable header",()=>{
    expect(parseTemplateRows("Instructions",[["Welcome to the program"]])).toBeNull();
  });

  it("preserves non-numeric targets instead of inventing reps",()=>{
    const workout=parseTemplateRows("Day 2 (Pull)",[["Excercise","This Week","Target Reps","Notes"],["Dead Hang","","2 Minutes (Non consecutive)",""]]);
    expect(workout?.exercises[0].sets[0].targetReps).toBe("2 Minutes (Non consecutive)");
  });
});
