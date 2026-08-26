"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { explainExerciseScore, scoreExercisePerformance, type ExerciseScoreResult, type PerformanceSet } from "@/features/scoring/progressiveOverload";
import { detectPersonalRecords, type PersonalRecordResult, type PRSet } from "@/features/scoring/personalRecords";
import { calculateStrengthChange, type StrengthChangeResult } from "@/features/scoring/strengthChange";
import { formatHistoricalPerformanceDate, reportExerciseStatus, type HistoricalExercisePerformance } from "@/features/history/exerciseComparison";

type RawSet = { weight:number; reps:number; partial_reps:number; set_type:string; set_number?:number };
type ExerciseSession = { exercise_id:string; exercise_name_snapshot:string; position:number; notes:string|null; sets:RawSet[] };
type Session = { id:string; workout_id:string; workout_name_snapshot:string; completed_at:string|null; notes:string|null };
type PriorSession = { id:string; completed_at:string; notes:string|null };
type ReportRow = { name:string; position:number; result:ExerciseScoreResult; prs:PersonalRecordResult[]; status:ReturnType<typeof reportExerciseStatus>; history:HistoricalExercisePerformance<RawSet>|null };
type CoachFeedback = { id:string; feedback:string; coach_user_id:string; created_at:string; updated_at:string };

function normalizeSets(sets:RawSet[]):PerformanceSet[]{return sets.filter(s=>["warmup","working","top","backoff"].includes(s.set_type)).map(s=>({weight:Number(s.weight),reps:s.reps,partialReps:s.partial_reps,setType:s.set_type as PerformanceSet["setType"]}));}
function prSets(sets:RawSet[]):PRSet[]{return sets.map(s=>({weight:Number(s.weight),reps:s.reps,partialReps:s.partial_reps,setType:s.set_type}));}
function combinedNotes(a:string|null|undefined,b:string|null|undefined){return[a,b].filter(Boolean).join(" ").trim()||null;}
function strengthSets(sets:RawSet[]){return sets.map(s=>({weight:Number(s.weight),reps:s.reps,setType:s.set_type}));}
function prMessage(pr:PersonalRecordResult,unit:"lb"|"kg"){if(pr.type==="heaviest_weight")return`New weight PR: ${pr.weight} ${unit} × ${pr.reps}. Previous heaviest load was ${pr.previousWeight??"N/A"}${pr.previousWeight===null?"":` ${unit}`}.`;return`Rep PR at ${pr.weight} ${unit}: ${pr.reps} reps, up from ${pr.previousReps??"N/A"}.`;}
function performedSets(sets:RawSet[]){return normalizeSets(sets).filter(s=>s.setType!=="warmup");}

export default function WorkoutReportPage(){
  const params=useParams<{id:string}>();
  const[session,setSession]=useState<Session|null>(null),[rows,setRows]=useState<ReportRow[]>([]),[topSetScores,setTopSetScores]=useState<ExerciseScoreResult[]>([]),[strengthChange,setStrengthChange]=useState<StrengthChangeResult|null>(null),[coachFeedback,setCoachFeedback]=useState<CoachFeedback[]>([]),[weightUnit,setWeightUnit]=useState<"lb"|"kg">("lb"),[loading,setLoading]=useState(true),[message,setMessage]=useState("");

  const loadReport=useCallback(async()=>{
    const supabase=createSupabaseBrowserClient();
    const{data:{user}}=await supabase.auth.getUser();
    if(!user){window.location.href="/auth";return;}
    const{data:athleteProfile}=await supabase.from("athlete_profiles").select("preferred_unit").eq("user_id",user.id).single();
    setWeightUnit(athleteProfile?.preferred_unit==="kg"?"kg":"lb");
    const{data:currentSession,error:currentError}=await supabase.from("workout_sessions").select("id, workout_id, workout_name_snapshot, completed_at, notes").eq("id",params.id).eq("athlete_user_id",user.id).eq("status","completed").single();
    if(currentError||!currentSession){setMessage(currentError?.message??"Completed workout not found.");setLoading(false);return;}
    const{data:feedbackRows}=await supabase.from("coach_workout_feedback").select("id, feedback, coach_user_id, created_at, updated_at").eq("workout_session_id",params.id).eq("athlete_user_id",user.id).order("updated_at",{ascending:false});
    setCoachFeedback((feedbackRows??[])as CoachFeedback[]);
    if((feedbackRows??[]).length>0){const{error}=await supabase.rpc("mark_coach_feedback_read",{p_workout_session_id:params.id});if(error)console.error("PHATBOT could not mark coach feedback read",error);}
    const{data:currentExercises,error:exerciseError}=await supabase.from("exercise_sessions").select("exercise_id, exercise_name_snapshot, position, notes, sets(weight, reps, partial_reps, set_type, set_number)").eq("workout_session_id",params.id).order("position",{ascending:true});
    if(exerciseError){setMessage(exerciseError.message);setLoading(false);return;}
    const current=(currentExercises??[])as ExerciseSession[];
    const{data:priorSessionRows}=await supabase.from("workout_sessions").select("id, completed_at, notes").eq("athlete_user_id",user.id).eq("status","completed").lt("completed_at",currentSession.completed_at).order("completed_at",{ascending:false});
    const priorSessions=(priorSessionRows??[]) as PriorSession[];
    const priorById=new Map(priorSessions.map(s=>[s.id,s]));
    const priorIds=priorSessions.map(s=>s.id);
    let allPriorExercises:(ExerciseSession&{workout_session_id:string})[]=[];
    if(priorIds.length){const{data}=await supabase.from("exercise_sessions").select("workout_session_id, exercise_id, exercise_name_snapshot, position, notes, sets(weight, reps, partial_reps, set_type, set_number)").in("workout_session_id",priorIds);allPriorExercises=(data??[]) as (ExerciseSession&{workout_session_id:string})[];}
    const{data:previousSameWorkout}=await supabase.from("workout_sessions").select("id, notes").eq("athlete_user_id",user.id).eq("workout_id",currentSession.workout_id).eq("status","completed").lt("completed_at",currentSession.completed_at).order("completed_at",{ascending:false}).limit(1).maybeSingle();
    const previousExercises=previousSameWorkout?allPriorExercises.filter(e=>e.workout_session_id===previousSameWorkout.id):[];
    const reportRows:ReportRow[]=[];
    for(const exercise of current){
      const candidates=allPriorExercises.filter(e=>e.exercise_id===exercise.exercise_id&&performedSets(e.sets??[]).length>0).sort((a,b)=>new Date(priorById.get(b.workout_session_id)?.completed_at??0).getTime()-new Date(priorById.get(a.workout_session_id)?.completed_at??0).getTime());
      const previous=candidates[0]??null;
      const previousSession=previous?priorById.get(previous.workout_session_id)??null:null;
      const history:HistoricalExercisePerformance<RawSet>|null=previous&&previousSession?{workoutSessionId:previous.workout_session_id,completedAt:previousSession.completed_at,notes:combinedNotes(previousSession.notes,previous.notes),sets:previous.sets??[]}:null;
      const currentComparable=performedSets(exercise.sets??[]);
      const status=reportExerciseStatus({currentComparableSetCount:currentComparable.length,historicalPerformance:history});
      const result=scoreExercisePerformance({sets:normalizeSets(exercise.sets??[]),notes:combinedNotes(currentSession.notes,exercise.notes)},previous?{sets:normalizeSets(previous.sets??[]),notes:combinedNotes(previousSession?.notes,previous.notes)}:null);
      const historicalSets=allPriorExercises.filter(e=>e.exercise_id===exercise.exercise_id).flatMap(e=>e.sets??[]);
      reportRows.push({name:exercise.exercise_name_snapshot,position:exercise.position,result,prs:detectPersonalRecords(prSets(exercise.sets??[]),prSets(historicalSets)),status,history});
    }
    if(previousSameWorkout)setStrengthChange(calculateStrengthChange(current.map(e=>({exerciseId:e.exercise_id,sets:strengthSets(e.sets??[])})),previousExercises.map(e=>({exerciseId:e.exercise_id,sets:strengthSets(e.sets??[])}))));else setStrengthChange(null);
    const first=[...current].sort((a,b)=>a.position-b.position)[0];
    const priorFirst=first?allPriorExercises.filter(e=>e.exercise_id===first.exercise_id&&performedSets(e.sets??[]).length>0).sort((a,b)=>new Date(priorById.get(b.workout_session_id)?.completed_at??0).getTime()-new Date(priorById.get(a.workout_session_id)?.completed_at??0).getTime())[0]??null:null;
    const firstSets=first?performedSets(first.sets??[]).slice(0,3):[],previousSets=priorFirst?performedSets(priorFirst.sets??[]).slice(0,3):[];
    setTopSetScores(firstSets.map((s,i)=>{
      const previousSet=previousSets[i]??null;
      if(!previousSet&&priorFirst&&i>=previousSets.length&&s.reps>=3){return{result:"progression",score:1,explanationCode:"added_set_three_plus_reps",currentBest:s,previousBest:null};}
      return scoreExercisePerformance({sets:[s],notes:combinedNotes(currentSession.notes,first?.notes)},previousSet?{sets:[previousSet],notes:combinedNotes(priorById.get(priorFirst?.workout_session_id??"")?.notes,priorFirst?.notes)}:null);
    }));
    setSession(currentSession as Session);setRows(reportRows);setLoading(false);
  },[params.id]);

  useEffect(()=>{loadReport();},[loadReport]);
  if(loading)return<main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Beep boop... PHATBOT is building your report.</main>;
  if(!session)return<main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p>{message}</p><Link href="/" className="mt-6 inline-block underline">Dashboard</Link></main>;
  const scoredRows=rows.filter(r=>r.status.isScored&&r.result.result!=="baseline"),comparableTop=topSetScores.filter(r=>r.result!=="baseline"),topAverage=comparableTop.length?comparableTop.reduce((s,r)=>s+r.score,0)/comparableTop.length:null,accessoryRows=scoredRows.filter(r=>r.position>1),accessoryAverage=accessoryRows.length?accessoryRows.reduce((s,r)=>s+r.result.score,0)/accessoryRows.length:null,score=topAverage===null?(accessoryAverage===null?null:Math.round(accessoryAverage*100)):accessoryAverage===null?Math.round(topAverage*100):Math.round((topAverage*.6+accessoryAverage*.4)*100),progressed=scoredRows.filter(r=>r.result.result==="progression").length,neutral=scoredRows.filter(r=>r.result.result==="neutral").length,regressed=scoredRows.filter(r=>r.result.result==="regression").length,allPRs=rows.flatMap(r=>r.prs.map(pr=>({...pr,exercise:r.name}))),featuredPR=allPRs[0]??null,strengthPercent=strengthChange?.percentageChange??null,qualityProtected=rows.some(r=>r.status.isScored&&["lower_weight_improved_quality","fewer_reps_improved_quality"].includes(r.result.explanationCode))||topSetScores.some(r=>["lower_weight_improved_quality","fewer_reps_improved_quality"].includes(r.explanationCode));
  return<main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT Workout Report</p><h1 className="mt-2 text-3xl font-bold">{session.workout_name_snapshot}</h1><p className="mt-2 text-zinc-400">Did you improve today?</p><p className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Loads shown in {weightUnit}</p></header>
    {featuredPR&&<section className="overflow-hidden rounded-3xl border-2 border-zinc-400 bg-zinc-950 p-7 text-center shadow-2xl sm:p-10"><p className="text-xs font-black uppercase tracking-[.3em] text-zinc-400">🤖 PHATBOT WIN CARD</p><p className="mt-4 text-sm font-bold uppercase tracking-[.18em]">BEEP BOOP — NEW BEST DETECTED</p><h2 className="mt-5 text-3xl font-black sm:text-4xl">{featuredPR.exercise}</h2><p className="mt-3 text-5xl font-black tracking-tight sm:text-6xl">{featuredPR.weight} {weightUnit} × {featuredPR.reps}</p><p className="mt-6 text-lg font-bold">🏆 Milestone logged. Hardware functioning beautifully.</p></section>}
    {qualityProtected&&<section className="rounded-2xl border border-zinc-600 p-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">🤖 Technique Signal Detected</p><p className="mt-2 text-lg font-semibold">Better execution counts.</p><p className="mt-2 text-sm leading-6 text-zinc-300">PHATBOT protected intentional improvements in form, control, tempo, range of motion, or time under tension from being scored as regression.</p></section>}
    {coachFeedback.length>0&&<section className="rounded-2xl border border-zinc-600 p-6"><p className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-400">🤖 Coach Transmission</p><h2 className="mt-2 text-2xl font-bold">Your coach left feedback.</h2><div className="mt-4 flex flex-col gap-3">{coachFeedback.map(i=><div key={i.id} className="rounded-xl bg-zinc-900 p-5"><p className="whitespace-pre-wrap text-base leading-7 text-zinc-100">{i.feedback}</p><p className="mt-3 text-xs text-zinc-500">Updated {new Date(i.updated_at).toLocaleString()}</p></div>)}</div></section>}
    {allPRs.length>0&&<section className="rounded-2xl border border-zinc-600 p-6"><p className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-400">🏆 Personal Records</p><h2 className="mt-2 text-2xl font-bold">{allPRs.length} PR{allPRs.length===1?"":"s"} today</h2><div className="mt-4 flex flex-col gap-3">{allPRs.map((pr,i)=><div key={`${pr.exercise}-${pr.type}-${pr.weight}-${i}`} className="rounded-xl bg-zinc-900 p-4"><p className="font-semibold">{pr.exercise}</p><p className="mt-1 text-sm text-zinc-300">{prMessage(pr,weightUnit)}</p></div>)}</div></section>}
    <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-zinc-800 p-6 text-center"><p className="text-sm uppercase tracking-widest text-zinc-500">Progressive Overload Score</p><p className="mt-2 text-5xl font-black">{score===null?"BASELINE":`${score}%`}</p><p className="mt-3 text-sm text-zinc-400">{score===null?"No comparable performed exercises yet.":`${progressed} progressed · ${neutral} neutral · ${regressed} regressed`}</p></div><div className="rounded-2xl border border-zinc-800 p-6 text-center"><p className="text-sm uppercase tracking-widest text-zinc-500">Training Volume vs Last Workout</p><p className="mt-2 text-5xl font-black">{strengthPercent===null?"N/A":`${strengthPercent>=0?"+":""}${strengthPercent.toFixed(1)}%`}</p><p className="mt-3 text-sm text-zinc-400">{strengthChange?.comparableExerciseCount?`${strengthChange.comparableExerciseCount} comparable exercise${strengthChange.comparableExerciseCount===1?"":"s"} · ${weightUnit} × full reps`:"Complete this workout again to establish a comparison."}</p></div></section>
    <section className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400"><strong className="text-zinc-200">Two useful comparisons:</strong> PO scoring follows the last time you actually performed each exercise. Training volume compares this workout with the previous completion of the same workout using common exercises only. Volume includes productive non-warmup, non-timed sets such as working, backoff, drop, and tempo work.</section>
    {topSetScores.length>0&&<section className="rounded-xl border border-zinc-800 p-5"><h2 className="font-semibold">Top Block Set Results</h2><div className="mt-3 flex flex-col gap-2">{topSetScores.map((r,i)=><div key={i} className="flex items-center justify-between rounded-lg bg-zinc-900 p-3 text-sm"><span>Set {i+1}{r.currentBest?` · ${r.currentBest.weight} ${weightUnit} × ${r.currentBest.reps}`:""}</span><span className="text-xs font-bold uppercase">{r.result}</span></div>)}</div></section>}
    <section className="flex flex-col gap-3">{rows.map(r=><article key={`${r.position}-${r.name}`} className="rounded-xl border border-zinc-800 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-zinc-500">Exercise {r.position}{r.position===1?" · Contains Top Block":" · Rest of Workout"}</p><h2 className="mt-1 text-lg font-semibold">{r.name}</h2></div><span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold uppercase">{r.status.label==="SCORED"?r.result.result:r.status.label}</span></div><p className="mt-3 text-sm leading-6 text-zinc-300">{r.status.isScored?explainExerciseScore(r.result.explanationCode):r.status.explanation}</p>{r.history&&<div className="mt-4 rounded-lg bg-zinc-900 p-3"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Last Performance · {formatHistoricalPerformanceDate(r.history.completedAt)}</p><div className="mt-2 flex flex-wrap gap-2">{r.history.sets.filter(s=>["working","top","backoff"].includes(s.set_type)).map((s,i)=><span key={i} className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300">{Number(s.weight)} {weightUnit} × {s.reps}{s.partial_reps>0?` +${s.partial_reps}`:""}</span>)}</div></div>}{r.prs.length>0&&<div className="mt-4 flex flex-col gap-2">{r.prs.map((pr,i)=><p key={i} className="text-sm font-semibold">🏆 {prMessage(pr,weightUnit)}</p>)}</div>}</article>)}</section>
    {session.notes&&<section className="rounded-xl border border-zinc-800 p-5"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Workout Notes</p><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{session.notes}</p></section>}
    <div className="grid gap-3 sm:grid-cols-3"><Link href="/progress" className="rounded-lg border border-zinc-700 px-4 py-3 text-center font-semibold">Progress Center</Link><Link href="/reports" className="rounded-lg border border-zinc-700 px-4 py-3 text-center font-semibold">All Reports</Link><Link href="/" className="rounded-lg bg-white px-4 py-3 text-center font-semibold text-black">Dashboard</Link></div>
  </main>;
}