import {describe,expect,it} from "vitest";
import {consistencyLabel,nutritionConsistency,performanceGuardrail,type NutritionDay} from "./nutrition";
const day=(date:string,kcal:number|null,protein:number|null=150):NutritionDay=>({nutrition_date:date,energy_kcal:kcal,protein_g:protein,carbohydrate_g:null,fat_g:null,source:"healthkit",source_origins:["test"]});
describe("nutrition consistency",()=>{
  it("treats missing days as unknown rather than zero",()=>{const result=nutritionConsistency([day("2026-10-01",2200),day("2026-10-02",2250)],7);expect(result.recordedDays).toBe(2);expect(result.averageCalories).toBe(2225);expect(result.coveragePercent).toBe(29);expect(consistencyLabel(result)).toBe("Building your baseline");});
  it("rewards repeatability rather than low calories",()=>{const high=nutritionConsistency([1,2,3,4,5,6,7].map(n=>day(`2026-10-0${n}`,3000+n*10)));const low=nutritionConsistency([1,2,3,4,5,6,7].map(n=>day(`2026-10-0${n}`,1200+n*10)));expect(consistencyLabel(high)).toBe("Very consistent");expect(consistencyLabel(low)).toBe("Very consistent");});
});
describe("performance preservation guardrail",()=>{
  it("does not blame a deficit when recovery is poor",()=>{const result=performanceGuardrail({strengthDeclining:true,cardioDeclining:false,recoveryAdequate:false,nutritionConsistent:true,energyDeficitLikely:true});expect(result?.detail).toContain("sleep and recovery");expect(result?.detail).not.toContain("larger energy deficit");});
  it("considers deficit only after recovery and consistency look normal",()=>{const result=performanceGuardrail({strengthDeclining:true,cardioDeclining:false,recoveryAdequate:true,nutritionConsistent:true,energyDeficitLikely:true});expect(result?.detail).toContain("may be contributing");expect(result?.detail).toContain("avoid increasing training intensity");});
  it("does not praise restriction when performance is stable",()=>{expect(performanceGuardrail({strengthDeclining:false,cardioDeclining:false,recoveryAdequate:true,nutritionConsistent:true,energyDeficitLikely:true})).toBeNull();});
});
