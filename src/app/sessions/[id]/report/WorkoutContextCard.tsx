"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Context = { sleepHours:number|null; sleepDate:string|null; weightChange:number|null; weightUnit:"lb"|"kg"; weightDays:number|null };
function dayDiff(later:Date,earlier:Date){return Math.max(0,Math.round((later.getTime()-earlier.getTime())/86400000));}

export default function WorkoutContextCard({sessionId}:{sessionId:string}){
 const[ctx,setCtx]=useState<Context|null>(null);
 useEffect(()=>{let cancelled=false;const supabase=createSupabaseBrowserClient();async function load(){
  const{data:{user}}=await supabase.auth.getUser();if(!user)return;
  const{data:session}=await supabase.from("workout_sessions").select("completed_at").eq("id",sessionId).eq("athlete_user_id",user.id).eq("status","completed").single();if(!session?.completed_at)return;
  const completedAt=new Date(session.completed_at),start=new Date(completedAt);start.setDate(start.getDate()-14);
  const[profileResult,sleepResult,weightResult]=await Promise.all([
   supabase.from("athlete_profiles").select("preferred_unit").eq("user_id",user.id).single(),
   supabase.from("health_sleep_nights").select("wake_date,asleep_seconds").eq("athlete_user_id",user.id).lte("wake_date",completedAt.toISOString().slice(0,10)).gte("wake_date",start.toISOString().slice(0,10)).gt("asleep_seconds",0).order("wake_date",{ascending:false}).limit(1),
   supabase.from("bodyweight_measurements").select("measured_at,weight_kg").eq("athlete_user_id",user.id).lte("measured_at",session.completed_at).gte("measured_at",start.toISOString()).order("measured_at",{ascending:false}).limit(2)
  ]);
  const sleep=sleepResult.data?.[0]??null,weights=weightResult.data??[],unit=profileResult.data?.preferred_unit==="kg"?"kg":"lb";let weightChange:number|null=null,weightDays:number|null=null;
  if(weights.length>=2){const factor=unit==="kg"?1:1/0.45359237;weightChange=(Number(weights[0].weight_kg)-Number(weights[1].weight_kg))*factor;weightDays=dayDiff(new Date(weights[0].measured_at),new Date(weights[1].measured_at));}
  if(!cancelled)setCtx({sleepHours:sleep?Number(sleep.asleep_seconds)/3600:null,sleepDate:sleep?.wake_date??null,weightChange,weightUnit:unit,weightDays});
 }void load();return()=>{cancelled=true;};},[sessionId]);
 if(!ctx||(ctx.sleepHours===null&&ctx.weightChange===null))return null;
 return <section className="rounded-2xl border border-zinc-800 p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Recent Context</p><h2 className="mt-2 text-xl font-black">Useful context, not a verdict.</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">
 {ctx.sleepHours!==null&&<div className="rounded-xl bg-zinc-950 p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-600">Sleep</p><p className="mt-2 text-2xl font-black">{ctx.sleepHours.toFixed(1)} hr</p><p className="mt-1 text-xs leading-5 text-zinc-500">Most recent recorded sleep before this workout{ctx.sleepDate?` · ${ctx.sleepDate}`:""}.</p></div>}
 {ctx.weightChange!==null&&<div className="rounded-xl bg-zinc-950 p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-600">Body Weight</p><p className="mt-2 text-2xl font-black">{ctx.weightChange>0?"+":""}{ctx.weightChange.toFixed(1)} {ctx.weightUnit}</p><p className="mt-1 text-xs leading-5 text-zinc-500">Change between your two most recent measurements{ctx.weightDays!==null?` · ${ctx.weightDays} day${ctx.weightDays===1?"":"s"} apart`:""}.</p></div>}
 </div><p className="mt-4 text-xs leading-5 text-zinc-600">These signals can help you notice patterns over time. PHATBOT does not assume sleep or body-weight change caused today&apos;s workout result.</p></section>;
}
