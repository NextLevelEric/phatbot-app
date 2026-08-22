"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function CoachNewWorkoutPage(){
 const {athleteId}=useParams<{athleteId:string}>();
 const [name,setName]=useState(""),[description,setDescription]=useState(""),[athleteName,setAthleteName]=useState("Athlete"),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{const supabase=createSupabaseBrowserClient();supabase.from("profiles").select("display_name").eq("id",athleteId).maybeSingle().then(({data})=>setAthleteName(data?.display_name??"Athlete"));},[athleteId]);
 async function submit(e:FormEvent){e.preventDefault();setSaving(true);setMessage("");const trimmed=name.trim();if(!trimmed){setMessage("Give the workout a name.");setSaving(false);return;}const supabase=createSupabaseBrowserClient();const{data,error}=await supabase.from("workouts").insert({athlete_user_id:athleteId,name:trimmed,description:description.trim()||null,is_active:true}).select("id").single();if(error){setMessage(error.message);setSaving(false);return;}window.location.href=`/workouts/${data.id}`;}
 return <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-7 px-4 py-8 sm:px-6 sm:py-10"><header><p className="phat-accent text-sm font-semibold uppercase tracking-[.25em]">PHATBOT Coach · Program Athlete</p><h1 className="mt-2 text-3xl font-bold">Add workout for {athleteName}</h1><p className="mt-2 text-zinc-400">Build the athlete's training before or after they activate their account. The workout will be waiting in their PHATBOT workspace.</p></header><form onSubmit={submit} className="flex flex-col gap-5 rounded-2xl border border-zinc-800 p-6"><label className="text-sm font-semibold">Workout name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Push A" className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3"/></label><label className="text-sm font-semibold">Description <span className="font-normal text-zinc-500">optional</span><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="Chest, shoulders, triceps" className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3"/></label>{message&&<p className="text-sm text-red-300">{message}</p>}<button disabled={saving} className="phat-accent-bg rounded-lg px-5 py-3 font-bold disabled:opacity-50">{saving?"Creating...":"Create Workout"}</button></form><Link href={`/coach/athletes/${athleteId}`} className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">Back to Athlete</Link></main>;
}
