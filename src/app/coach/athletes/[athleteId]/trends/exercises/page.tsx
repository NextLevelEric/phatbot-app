"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type RawSet={weight:number;reps:number;partial_reps:number;set_type:string;set_number:number};
type ExerciseSession={id:string;exercise_id:string;exercise_name_snapshot:string;workout_session_id:string;sets:RawSet[]};
type WorkoutSession={id:string;completed_at:string;workout_name_snapshot:string};
type StoredPR={exercise_id:string;exercise_session_id:string;pr_type:"heaviest_weight"|"matched_load_reps";weight:number;reps:number;achieved_at:string};
type Point={exerciseSessionId:string;sessionId:string;date:string;workoutName:string;weight:number;reps:number;volume:number;weightPR:boolean;repPR:boolean};

function validSets(sets:RawSet[]){return sets.filter(s=>s.set_type!=="warmup"&&s.reps>0);}
function bestWorkingSet(sets:RawSet[]){const v=validSets(sets);if(!v.length)return null;return [...v].sort((a,b)=>Number(b.weight)!==Number(a.weight)?Number(b.weight)-Number(a.weight):b.reps-a.reps)[0];}
function path(points:{x:number;y:number}[]){return points.map((p,i)=>`${i===0?"M":"L"} ${p.x} ${p.y}`).join(" ");}

function CoachExerciseTrendsContent(){
  const {athleteId}=useParams<{athleteId:string}>();
  const searchParams=useSearchParams();
  const requestedExercise=searchParams.get("exercise");
  const [athleteName,setAthleteName]=useState("Athlete");
  const [unit,setUnit]=useState<"lb"|"kg">("lb");
  const [exerciseSessions,setExerciseSessions]=useState<ExerciseSession[]>([]);
  const [workouts,setWorkouts]=useState<Record<string,WorkoutSession>>({});
  const [prs,setPrs]=useState<StoredPR[]>([]);
  const [selected,setSelected]=useState("");
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");

  useEffect(()=>{const supabase=createSupabaseBrowserClient();async function load(){
    const {data:{user}}=await supabase.auth.getUser();if(!user){window.location.href="/auth/coach";return;}
    const {data:link}=await supabase.from("coach_athletes").select("athlete_user_id").eq("coach_user_id",user.id).eq("athlete_user_id",athleteId).eq("active",true).maybeSingle();
    if(!link){setMessage("You do not have access to this athlete.");setLoading(false);return;}
    const [{data:profile},{data:athlete},{data:sessionRows,error:werr},{data:storedPrs,error:prerr}]=await Promise.all([
      supabase.from("profiles").select("display_name").eq("id",athleteId).maybeSingle(),
      supabase.from("athlete_profiles").select("preferred_unit").eq("user_id",athleteId).maybeSingle(),
      supabase.from("workout_sessions").select("id,completed_at,workout_name_snapshot").eq("athlete_user_id",athleteId).eq("status","completed").order("completed_at",{ascending:true}),
      supabase.from("personal_records").select("exercise_id,exercise_session_id,pr_type,weight,reps,achieved_at").eq("athlete_user_id",athleteId).order("achieved_at",{ascending:true})
    ]);
    setAthleteName(profile?.display_name??"Athlete");setUnit(athlete?.preferred_unit==="kg"?"kg":"lb");
    if(werr||prerr){setMessage(werr?.message??prerr?.message??"");setLoading(false);return;}
    const ws=(sessionRows??[]) as WorkoutSession[];setWorkouts(Object.fromEntries(ws.map(w=>[w.id,w])));setPrs((storedPrs??[]) as StoredPR[]);
    const ids=ws.map(w=>w.id);if(!ids.length){setLoading(false);return;}
    const {data,error}=await supabase.from("exercise_sessions").select("id,exercise_id,exercise_name_snapshot,workout_session_id,sets(weight,reps,partial_reps,set_type,set_number)").in("workout_session_id",ids);
    if(error){setMessage(error.message);setLoading(false);return;}
    const ex=(data??[]) as ExerciseSession[];setExerciseSessions(ex);
    const requested=requestedExercise&&ex.some(e=>e.exercise_id===requestedExercise)?requestedExercise:null;
    if(ex.length)setSelected(requested??ex[0].exercise_id);setLoading(false);
  }load();},[athleteId,requestedExercise]);

  const exercises=useMemo(()=>Array.from(new Map(exerciseSessions.map(e=>[e.exercise_id,e.exercise_name_snapshot])).entries()).sort((a,b)=>a[1].localeCompare(b[1])),[exerciseSessions]);
  const selectedPrs=useMemo(()=>prs.filter(p=>p.exercise_id===selected),[prs,selected]);
  const points=useMemo<Point[]>(()=>exerciseSessions.filter(e=>e.exercise_id===selected).sort((a,b)=>new Date(workouts[a.workout_session_id]?.completed_at??0).getTime()-new Date(workouts[b.workout_session_id]?.completed_at??0).getTime()).map(e=>{const best=bestWorkingSet(e.sets??[]);const ws=workouts[e.workout_session_id];if(!best||!ws)return null;const sessionPrs=selectedPrs.filter(p=>p.exercise_session_id===e.id);return{exerciseSessionId:e.id,sessionId:e.workout_session_id,date:ws.completed_at,workoutName:ws.workout_name_snapshot,weight:Number(best.weight),reps:best.reps,volume:Number(best.weight)*best.reps,weightPR:sessionPrs.some(p=>p.pr_type==="heaviest_weight"),repPR:sessionPrs.some(p=>p.pr_type==="matched_load_reps")};}).filter(Boolean) as Point[],[exerciseSessions,selected,workouts,selectedPrs]);
  const selectedName=exercises.find(([id])=>id===selected)?.[1]??"Exercise";
  const maxW=Math.max(...points.map(p=>p.weight),1),minW=Math.min(...points.map(p=>p.weight),0),range=Math.max(maxW-minW,1),coords=points.map((p,i)=>({x:points.length===1?50:(i/(points.length-1))*100,y:95-((p.weight-minW)/range)*85}));
  const latest=points.at(-1),prior=points.at(-2),gain=latest&&prior?latest.weight-prior.weight:null,allTimeBest=points.length?[...points].sort((a,b)=>b.weight-a.weight||b.reps-a.reps)[0]:null;

  if(loading)return <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">Beep boop... loading athlete exercise telemetry.</main>;
  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
    <header><p className="text-sm font-semibold uppercase tracking-[.25em] text-zinc-400">PHATBOT Coach Trends</p><h1 className="mt-2 text-3xl font-bold">{athleteName} · {selectedName}</h1><p className="mt-2 text-zinc-400">Coach view of this athlete's best non-warmup set over time, with archived PR markers.</p></header>
    {message&&<p className="rounded-xl border border-zinc-800 p-4">{message}</p>}
    {exercises.length>0&&<label className="flex flex-col gap-2 text-sm font-semibold">Exercise<select value={selected} onChange={e=>setSelected(e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3">{exercises.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>}
    {points.length===0?<section className="rounded-xl border border-zinc-800 p-5 text-zinc-400">No usable working sets found for this exercise.</section>:<>
      <section className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-zinc-800 p-5"><p className="text-xs uppercase tracking-widest text-zinc-500">Sessions</p><p className="mt-2 text-3xl font-bold">{points.length}</p></div><div className="rounded-xl border border-zinc-800 p-5"><p className="text-xs uppercase tracking-widest text-zinc-500">All-Time Best</p><p className="mt-2 text-2xl font-bold">{allTimeBest?.weight} {unit} × {allTimeBest?.reps}</p></div><div className="rounded-xl border border-zinc-800 p-5"><p className="text-xs uppercase tracking-widest text-zinc-500">Archived PRs</p><p className="mt-2 text-3xl font-bold">{selectedPrs.length}</p></div><div className="rounded-xl border border-zinc-800 p-5"><p className="text-xs uppercase tracking-widest text-zinc-500">vs Prior</p><p className="mt-2 text-2xl font-bold">{gain===null?"N/A":`${gain>=0?"+":""}${gain} ${unit}`}</p></div></section>
      <section className="rounded-2xl border border-zinc-800 p-5"><p className="text-xs font-bold uppercase tracking-[.2em] text-zinc-400">🤖 Load Signal</p><h2 className="mt-2 text-xl font-bold">Best-set weight trend ({unit})</h2><div className="mt-5 h-56 w-full"><svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none"><line x1="0" y1="95" x2="100" y2="95" stroke="currentColor" opacity=".15"/><path d={path(coords)} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"/>{coords.map((c,i)=><circle key={i} cx={c.x} cy={c.y} r={points[i].weightPR||points[i].repPR?"2.8":"1.8"} fill="currentColor"/>)}</svg></div></section>
      <section className="flex flex-col gap-3">{points.slice().reverse().map(p=><Link key={p.exerciseSessionId} href={`/coach/athletes/${athleteId}/sessions/${p.sessionId}`} className="rounded-xl border border-zinc-800 p-4 hover:border-zinc-600"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold">{new Date(p.date).toLocaleDateString()}</p><p className="mt-1 text-xs text-zinc-500">{p.workoutName}{p.weightPR?" · 🏆 Weight PR":p.repPR?" · ⚡ Rep PR":""}</p></div><div className="text-right"><p className="text-xl font-bold">{p.weight} {unit} × {p.reps}</p><p className="text-sm text-zinc-400">Volume {p.volume} {unit}-reps</p></div></div></Link>)}</section>
    </>}
    <Link href={`/coach/athletes/${athleteId}`} className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">Back to Athlete</Link>
  </main>;
}

export default function CoachExerciseTrends(){return <Suspense fallback={<main className="mx-auto min-h-screen max-w-3xl px-6 py-12">Beep boop... loading athlete exercise telemetry.</main>}><CoachExerciseTrendsContent/></Suspense>;}
