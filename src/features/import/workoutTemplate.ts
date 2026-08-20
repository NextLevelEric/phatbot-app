export type TemplateRow = { exerciseName: string; targetReps: string | null; notes: string | null; sourceRow: number };
export type TemplateExercise = { name: string; sets: { targetReps: string | null }[]; notes: string | null };
export type TemplateWorkout = { sheetName: string; name: string; exercises: TemplateExercise[]; warnings: string[] };

function text(value: unknown) { return value == null ? "" : String(value).trim(); }
function normalized(value: unknown) { return text(value).toLowerCase().replace(/\s+/g, " "); }
function isExerciseHeader(value: unknown) { const v=normalized(value); return v === "exercise" || v === "excercise"; }
function isTargetHeader(value: unknown) { return normalized(value).includes("target reps"); }
function isNotesHeader(value: unknown) { return normalized(value) === "notes"; }

export function workoutNameFromSheet(sheetName: string) {
  const match=sheetName.trim().match(/^day\s*\d+\s*(?:\((.*?)\))?/i);
  if (!match) return sheetName.trim();
  const label=match[1]?.trim();
  return label ? `${sheetName.match(/^day\s*\d+/i)?.[0]} (${label})` : sheetName.trim();
}

export function parseTemplateRows(sheetName: string, rows: unknown[][]): TemplateWorkout | null {
  const headerIndex=rows.findIndex(row=>row.some(isExerciseHeader) && row.some(isTargetHeader));
  if(headerIndex<0) return null;
  const header=rows[headerIndex];
  const exerciseCol=header.findIndex(isExerciseHeader);
  const targetCol=header.findIndex(isTargetHeader);
  const notesCol=header.findIndex(isNotesHeader);
  const parsed:TemplateRow[]=[];
  const warnings:string[]=[];
  for(let i=headerIndex+1;i<rows.length;i++){
    const row=rows[i]??[]; const exerciseName=text(row[exerciseCol]);
    if(!exerciseName) continue;
    const target=text(row[targetCol]); const notes=notesCol>=0?text(row[notesCol]):"";
    parsed.push({exerciseName,targetReps:target||null,notes:notes||null,sourceRow:i+1});
  }
  if(!parsed.length){warnings.push("No exercise rows were found below the workout header.");return {sheetName,name:workoutNameFromSheet(sheetName),exercises:[],warnings};}
  const exercises:TemplateExercise[]=[];
  for(const row of parsed){
    const last=exercises[exercises.length-1];
    if(last && normalized(last.name)===normalized(row.exerciseName)){
      last.sets.push({targetReps:row.targetReps});
      if(row.notes && !last.notes) last.notes=row.notes;
    }else{
      exercises.push({name:row.exerciseName,sets:[{targetReps:row.targetReps}],notes:row.notes});
    }
  }
  for(const exercise of exercises){
    if(exercise.sets.some(set=>!set.targetReps)) warnings.push(`${exercise.name} has one or more blank target-rep rows.`);
  }
  return {sheetName,name:workoutNameFromSheet(sheetName),exercises,warnings};
}
