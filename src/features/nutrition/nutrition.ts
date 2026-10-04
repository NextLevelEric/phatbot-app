export type NutritionSource = "healthkit" | "health_connect" | "partner";

export type NutritionDay = {
  nutrition_date: string;
  energy_kcal: number | null;
  protein_g: number | null;
  carbohydrate_g: number | null;
  fat_g: number | null;
  source: NutritionSource;
  source_origins: string[];
};

export type NutritionConsistency = {
  recordedDays: number;
  possibleDays: number;
  coveragePercent: number;
  calorieDays: number;
  averageCalories: number | null;
  calorieCvPercent: number | null;
  proteinDays: number;
  averageProteinG: number | null;
  proteinCvPercent: number | null;
};

const finitePositive=(value:number|null|undefined)=>typeof value==="number"&&Number.isFinite(value)&&value>0;
const average=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const cv=(values:number[])=>{const mean=average(values);if(mean===null||mean<=0||values.length<2)return null;const variance=values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length;return Math.sqrt(variance)/mean*100;};

export function nutritionConsistency(days:readonly NutritionDay[],possibleDays=7):NutritionConsistency {
  const recorded=days.filter(day=>[day.energy_kcal,day.protein_g,day.carbohydrate_g,day.fat_g].some(value=>finitePositive(value)));
  const calories=recorded.map(day=>day.energy_kcal).filter(finitePositive) as number[];
  const protein=recorded.map(day=>day.protein_g).filter(finitePositive) as number[];
  return {
    recordedDays:recorded.length,possibleDays,
    coveragePercent:possibleDays?Math.round(recorded.length/possibleDays*100):0,
    calorieDays:calories.length,averageCalories:average(calories),calorieCvPercent:cv(calories),
    proteinDays:protein.length,averageProteinG:average(protein),proteinCvPercent:cv(protein),
  };
}

export function consistencyLabel(metric:NutritionConsistency) {
  if(metric.recordedDays<4)return "Building your baseline";
  if(metric.calorieCvPercent===null)return "More complete days needed";
  if(metric.calorieCvPercent<=15)return "Very consistent";
  if(metric.calorieCvPercent<=25)return "Consistent";
  return "Variable week";
}

export type PerformanceGuardrailInput={
  strengthDeclining:boolean;
  cardioDeclining:boolean;
  recoveryAdequate:boolean|null;
  nutritionConsistent:boolean|null;
  energyDeficitLikely:boolean|null;
};

export function performanceGuardrail(input:PerformanceGuardrailInput) {
  if(!input.strengthDeclining&&!input.cardioDeclining)return null;
  const performance=input.strengthDeclining?"strength":"cardio performance";
  if(input.recoveryAdequate===false)return {level:"attention" as const,title:"Protect performance",detail:`Your ${performance} is trending down while recovery also looks limited. Reduce unnecessary training intensity, prioritize sleep and recovery, then reassess before pushing harder.`};
  if(input.nutritionConsistent===false)return {level:"attention" as const,title:"Protect performance",detail:`Your ${performance} is trending down and nutrition has been inconsistent. Focus on repeatable fueling and protein habits while managing training fatigue.`};
  if(input.recoveryAdequate===true&&input.nutritionConsistent===true&&input.energyDeficitLikely===true)return {level:"attention" as const,title:"Protect performance",detail:`Your ${performance} is trending down despite normal recovery and consistent nutrition. A larger energy deficit may be contributing. Consider a more moderate rate of loss or additional fueling, and avoid increasing training intensity until performance stabilizes.`};
  return {level:"watch" as const,title:"Watch the trend",detail:`Your ${performance} is trending down. PHATBOT cannot tell why from one signal alone; review training fatigue, sleep, and fueling before increasing intensity.`};
}
