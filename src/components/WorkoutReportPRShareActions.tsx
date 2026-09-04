"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import WorkoutWinShareCard from "@/components/WorkoutWinShareCard";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { detectPersonalRecords, type PRSet } from "@/features/scoring/personalRecords";

type RawSet={weight:number;reps:number;partial_reps:number;set_type:string};
type ExerciseRow={exercise_id:string;exercise_name_snapshot:string;sets:RawSet[]};
type SharePR={key:string;exercise:string;weight:number;reps:number;detail:string};
function prs(sets:RawSet[]):PRSet[]{return sets.map(s=>({weight:Number(s.weight),reps:s.reps,partialReps:s.partial_reps,setType:s.set_type}));}

export default function WorkoutReportPRShareActions({sessionId}:{sessionId:string}){
 const[items,setItems]=useState<SharePR[]>([]),[targets,setTargets]=useState<Element[]>([]);
 useEffect(()=>{let dead=false;async function load(){const s=createSupabaseBrowserClient();const{data:{user}}=await s.auth.getUser();if(!user)return;const{data:session}=await s.from("workout_sessions").select("completed_at, workout_name_snapshot").eq("id",sessionId).eq("athlete_user_id",user.id).maybeSingle();if(!session)return;const{data:current}=await s.from("exercise_sessions").select("exercise_id, exercise_name_snapshot, sets(weight,reps,partial_reps,set_type)").eq("workout_session_id",sessionId);const{data:priorSessions}=await s.from("workout_sessions").select("id").eq("athlete_user_id",user.id).eq("status","completed").lt("completed_at",session.completed_at);const ids=(priorSessions??[]).map(r=>r.id);let prior:({exercise_id:string;sets:RawSet[]}[]) = [];if(ids.length){const{data}=await s.from("exercise_sessions").select("exercise_id, sets(weight,reps,partial_reps,set_type)").in("workout_session_id",ids);prior=(data??[]) as typeof prior;}const out:SharePR[]=[];for(const e of (current??[]) as ExerciseRow[]){const history=prior.filter(p=>p.exercise_id===e.exercise_id).flatMap(p=>p.sets??[]);for(const pr of detectPersonalRecords(prs(e.sets??[]),prs(history))){out.push({key:`${e.exercise_id}-${pr.type}-${pr.weight}-${pr.reps}`,exercise:e.exercise_name_snapshot,weight:pr.weight,reps:pr.reps,detail:pr.type==="heaviest_weight"?"New heaviest weight":"New rep PR"});}}if(!dead)setItems(out);}void load();return()=>{dead=true}},[sessionId]);
 useEffect(()=>{if(!items.length)return;const timer=setTimeout(()=>{const sections=[...document.querySelectorAll("section")];const section=sections.find(s=>s.textContent?.includes("Personal Records"));if(!section)return;const cards=[...section.querySelectorAll(":scope .rounded-xl.bg-zinc-900")];setTargets(cards.slice(0,items.length));},100);return()=>clearTimeout(timer)},[items]);
 if(!items.length||!targets.length)return null;
 return <>{items.map((pr,i)=>targets[i]?createPortal(<div className="mt-3 border-t border-zinc-800 pt-3"><WorkoutWinShareCard kind="pr" workoutName="PHATBOT Workout" headline={pr.exercise} result={`${pr.weight} × ${pr.reps}`} detail={pr.detail}/></div>,targets[i],pr.key):null)}</>;
}
