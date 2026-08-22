import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreExercisePerformance, type PerformanceSet } from "@/features/scoring/progressiveOverload";
import { detectPersonalRecords, type PRSet } from "@/features/scoring/personalRecords";
import { calculateWeightedWorkoutScore } from "@/features/scoring/workoutScore";

type RawSet={id:string;weight:number;reps:number;partial_reps:number;set_type:string;set_number:number};
type ExerciseSession={id:string;exercise_id:string;exercise_name_snapshot:string;workout_session_id:string;position:number;notes:string|null;sets:RawSet[]};
type WorkoutSession={id:string;workout_name_snapshot:string;completed_at:string;notes:string|null};

function key(value:string){return value.trim().toLowerCase().replace(/\s+/g," ");}
function normalize(sets:RawSet[]):PerformanceSet[]{return [...sets].sort((a,b)=>a.set_number-b.set_number).filter(s=>["warmup","working","top","backoff"].includes(s.set_type)).map(s=>({weight:Number(s.weight),reps:s.reps,partialReps:s.partial_reps,setType:s.set_type as PerformanceSet["setType"]}));}
function prSets(sets:RawSet[]):PRSet[]{return sets.map(s=>({weight:Number(s.weight),reps:s.reps,partialReps:s.partial_reps,setType:s.set_type}));}
function combinedNotes(a:string|null|undefined,b:string|null|undefined){return[a,b].filter(Boolean).join(" ").trim()||null;}
function matchingSetId(sets:RawSet[],weight:number,reps:number){return sets.find(s=>Number(s.weight)===Number(weight)&&s.reps===reps)?.id??null;}

export async function backfillHistoricalIntelligence(supabase:SupabaseClient,athleteUserId:string){
 const {data:sessions,error:sessionError}=await supabase.from("workout_sessions").select("id,workout_name_snapshot,completed_at,notes").eq("athlete_user_id",athleteUserId).eq("status","completed").order("completed_at",{ascending:true});
 if(sessionError)throw sessionError;
 const workoutSessions=(sessions??[]) as WorkoutSession[];
 if(!workoutSessions.length)return{workoutsAnalyzed:0,workoutScores:0,personalRecords:0};
 const ids=workoutSessions.map(s=>s.id);
 const {data:exerciseData,error:exerciseError}=await supabase.from("exercise_sessions").select("id,exercise_id,exercise_name_snapshot,workout_session_id,position,notes,sets(id,weight,reps,partial_reps,set_type,set_number)").in("workout_session_id",ids);
 if(exerciseError)throw exerciseError;
 const exercises=(exerciseData??[]) as ExerciseSession[];
 const bySession=new Map<string,ExerciseSession[]>();
 for(const ex of exercises){const rows=bySession.get(ex.workout_session_id)??[];rows.push(ex);bySession.set(ex.workout_session_id,rows);}
 const lastWorkoutByName=new Map<string,{session:WorkoutSession;exercises:ExerciseSession[]}>();
 const historicalSetsByExercise=new Map<string,RawSet[]>();
 const exerciseScores:any[]=[];const workoutScores:any[]=[];const personalRecords:any[]=[];
 for(const session of workoutSessions){
  const current=[...(bySession.get(session.id)??[])].sort((a,b)=>a.position-b.position);
  const previousBundle=lastWorkoutByName.get(key(session.workout_name_snapshot));
  const previous=previousBundle?.exercises??[];
  const previousByName=new Map(previous.map(ex=>[key(ex.exercise_name_snapshot),ex]));
  const resultRows=current.map(ex=>{const prior=previousByName.get(key(ex.exercise_name_snapshot))??null;const result=scoreExercisePerformance({sets:normalize(ex.sets??[]),notes:combinedNotes(session.notes,ex.notes)},prior?{sets:normalize(prior.sets??[]),notes:combinedNotes(previousBundle?.session.notes,prior.notes)}:null);return{ex,prior,result};});
  for(const row of resultRows){
   exerciseScores.push({workout_session_id:session.id,exercise_session_id:row.ex.id,comparison_exercise_session_id:row.prior?.id??null,result:row.result.result,score:row.result.score,explanation_code:row.result.explanationCode});
   const exerciseKey=key(row.ex.exercise_name_snapshot);const history=historicalSetsByExercise.get(exerciseKey)??[];
   const prs=detectPersonalRecords(prSets(row.ex.sets??[]),prSets(history));
   for(const pr of prs)personalRecords.push({exercise_id:row.ex.exercise_id,exercise_session_id:row.ex.id,set_id:matchingSetId(row.ex.sets??[],pr.weight,pr.reps),pr_type:pr.type,weight:pr.weight,reps:pr.reps,previous_weight:pr.previousWeight,previous_reps:pr.previousReps,achieved_at:session.completed_at});
   historicalSetsByExercise.set(exerciseKey,[...history,...(row.ex.sets??[])]);
  }
  const first=current[0]??null;const priorFirst=first?previousByName.get(key(first.exercise_name_snapshot))??null:null;const firstSets=first?normalize(first.sets??[]).filter(s=>s.setType!=="warmup").slice(0,3):[];const priorFirstSets=priorFirst?normalize(priorFirst.sets??[]).filter(s=>s.setType!=="warmup").slice(0,3):[];
  const top=firstSets.map((set,i)=>scoreExercisePerformance({sets:[set],notes:combinedNotes(session.notes,first?.notes)},priorFirstSets[i]?{sets:[priorFirstSets[i]],notes:combinedNotes(previousBundle?.session.notes,priorFirst?.notes)}:null));
  const rest=resultRows.filter(r=>r.ex.id!==first?.id).map(r=>r.result);const score=calculateWeightedWorkoutScore(top,rest);
  const comparable=resultRows.filter(r=>r.result.result!=="baseline");
  if(score.percentage!==null&&(comparable.length||top.some(r=>r.result!=="baseline")))workoutScores.push({workout_session_id:session.id,score:score.percentage/100,scored_exercise_count:comparable.length,progression_count:comparable.filter(r=>r.result.result==="progression").length,neutral_count:comparable.filter(r=>r.result.result==="neutral").length,regression_count:comparable.filter(r=>r.result.result==="regression").length,baseline_count:resultRows.filter(r=>r.result.result==="baseline").length});
  lastWorkoutByName.set(key(session.workout_name_snapshot),{session,exercises:current});
 }
 const {data,error}=await supabase.rpc("backfill_athlete_training_intelligence",{p_athlete_user_id:athleteUserId,p_exercise_scores:exerciseScores,p_workout_scores:workoutScores,p_personal_records:personalRecords});
 if(error)throw error;
 return{workoutsAnalyzed:workoutSessions.length,workoutScores:workoutScores.length,personalRecords:personalRecords.length,...((data??{}) as object)};
}
