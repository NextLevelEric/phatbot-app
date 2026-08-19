"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { scoreExercisePerformance, type PerformanceSet } from "@/features/scoring/progressiveOverload";
import { detectPersonalRecords, type PRSet } from "@/features/scoring/personalRecords";
import { persistWorkoutResults } from "@/features/scoring/persistResults";

type RawSet={id?:string;weight:number;reps:number;partial_reps:number;set_type:string;set_number?:number};
type ExerciseSession={id:string;exercise_id:string;position:number;notes:string|null;sets:RawSet[]};
function normalize(sets:RawSet[]):PerformanceSet[]{return sets.filter(s=>["warmup","working","top","backoff"].includes(s.set_type)).map(s=>({weight:Number(s.weight),reps:s.reps,partialReps:s.partial_reps,setType:s.set_type as PerformanceSet["setType"]}));}
function prs(sets:RawSet[]):PRSet[]{return sets.map(s=>({weight:Number(s.weight),reps:s.reps,partialReps:s.partial_reps,setType:s.set_type}));}
function notes(a:string|null|undefined,b:string|null|undefined){return[a,b].filter(Boolean).join(" ").trim()||null;}
function single(c:PerformanceSet,p:PerformanceSet|null,cn?:string|null,pn?:string|null){return scoreExercisePerformance({sets:[c],notes:cn},p?{sets:[p],notes:pn}:null);}

export default function ScorePersistenceAgent(){
 useEffect(()=>{let cancelled=false;async function persist(){
  const match=window.location.pathname.match(/^\/sessions\/([^/]+)\/report\/?$/);if(!match)return;
  const sessionId=match[1],supabase=createSupabaseBrowserClient();const{data:{user}}=await supabase.auth.getUser();if(!user||cancelled)return;
  const{data:session}=await supabase.from("workout_sessions").select("id,workout_id,completed_at,notes").eq("id",sessionId).eq("athlete_user_id",user.id).eq("status","completed").maybeSingle();if(!session?.completed_at)return;
  const{data:currentData}=await supabase.from("exercise_sessions").select("id,exercise_id,position,notes,sets(id,weight,reps,partial_reps,set_type,set_number)").eq("workout_session_id",sessionId).order("position");const current=(currentData??[]) as ExerciseSession[];if(!current.length)return;
  const{data:previousSession}=await supabase.from("workout_sessions").select("id,notes").eq("athlete_user_id",user.id).eq("workout_id",session.workout_id).eq("status","completed").lt("completed_at",session.completed_at).order("completed_at",{ascending:false}).limit(1).maybeSingle();let previous:ExerciseSession[]=[];
  if(previousSession){const{data}=await supabase.from("exercise_sessions").select("id,exercise_id,position,notes,sets(id,weight,reps,partial_reps,set_type,set_number)").eq("workout_session_id",previousSession.id);previous=(data??[]) as ExerciseSession[];}
  const resultRows=[] as {exerciseSessionId:string;exerciseId:string;comparisonExerciseSessionId:string|null;result:ReturnType<typeof scoreExercisePerformance>;prs:ReturnType<typeof detectPersonalRecords>;sets:RawSet[]}[];
  for(const ex of current){const prior=previous.find(p=>p.exercise_id===ex.exercise_id)??null;const{data:history}=await supabase.from("exercise_sessions").select("sets(weight,reps,partial_reps,set_type)").eq("exercise_id",ex.exercise_id).neq("workout_session_id",sessionId);const historical=((history??[]) as {sets:RawSet[]}[]).flatMap(x=>x.sets??[]);resultRows.push({exerciseSessionId:ex.id,exerciseId:ex.exercise_id,comparisonExerciseSessionId:prior?.id??null,result:scoreExercisePerformance({sets:normalize(ex.sets??[]),notes:notes(session.notes,ex.notes)},prior?{sets:normalize(prior.sets??[]),notes:notes(previousSession?.notes,prior.notes)}:null),prs:detectPersonalRecords(prs(ex.sets??[]),prs(historical)),sets:ex.sets??[]});}
  const first=[...current].sort((a,b)=>a.position-b.position)[0],priorFirst=first?previous.find(p=>p.exercise_id===first.exercise_id)??null:null,firstSets=first?normalize(first.sets??[]).filter(s=>s.setType!=="warmup").slice(0,3):[],priorSets=priorFirst?normalize(priorFirst.sets??[]).filter(s=>s.setType!=="warmup").slice(0,3):[];
  const top=firstSets.map((s,i)=>single(s,priorSets[i]??null,notes(session.notes,first?.notes),notes(previousSession?.notes,priorFirst?.notes))).filter(r=>r.result!=="baseline"),topAvg=top.length?top.reduce((n,r)=>n+r.score,0)/top.length:null;
  const accessories=resultRows.filter((_,i)=>current[i].position>1&&resultRows[i].result.result!=="baseline"),accAvg=accessories.length?accessories.reduce((n,r)=>n+r.result.score,0)/accessories.length:null;
  const raw=topAvg===null?accAvg:accAvg===null?topAvg:topAvg*.6+accAvg*.4,workoutScore=raw===null?null:Math.round(raw*100);
  try{await persistWorkoutResults({supabase,athleteUserId:user.id,workoutSessionId:sessionId,completedAt:session.completed_at,exerciseRows:resultRows,workoutScore});}catch(error){console.error("PHATBOT could not persist historical scoring results",error);}
 }persist();return()=>{cancelled=true;};},[]);
 return null;
}
