"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function InviteAthletePage(){
 const [name,setName]=useState(""),[email,setEmail]=useState(""),[message,setMessage]=useState(""),[sending,setSending]=useState(false),[success,setSuccess]=useState(false),[athleteId,setAthleteId]=useState<string|null>(null);
 async function submit(e:FormEvent){
  e.preventDefault();setSending(true);setMessage("");setSuccess(false);setAthleteId(null);
  const supabase=createSupabaseBrowserClient();const{data:{session}}=await supabase.auth.getSession();
  if(!session){window.location.href="/auth/coach";return;}
  const response=await fetch("/api/athlete-invitations/send",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({athleteEmail:email,athleteName:name})});
  const result=await response.json();
  if(!response.ok){setMessage(result.error??"Unable to invite athlete.");setSending(false);return;}
  setSuccess(true);setAthleteId(result.athleteUserId??null);setMessage(result.status==="linked"?"Athlete found and linked. Their PHATBOT workspace is ready now.":"Athlete workspace created and invitation email sent. You can begin programming workouts immediately.");setSending(false);
 }
 return <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10"><header><p className="phat-accent text-sm font-semibold uppercase tracking-[.25em]">PHATBOT Coach</p><h1 className="mt-2 text-3xl font-bold">Invite Athlete</h1><p className="mt-2 text-zinc-400">Create the athlete workspace now, program their training, and let the athlete activate the account from the email invite when they are ready.</p></header><form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-zinc-800 p-6"><label className="text-sm font-semibold">Athlete name <span className="font-normal text-zinc-500">(optional)</span><input value={name} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3" placeholder="Jane Athlete"/></label><label className="text-sm font-semibold">Athlete email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3" placeholder="athlete@example.com"/></label><button disabled={sending} className="phat-accent-bg rounded-lg px-5 py-3 font-bold disabled:opacity-50">{sending?"Beep boop... creating workspace":"Invite Athlete"}</button></form>{message&&<section className={`rounded-xl border p-4 ${success?"border-[rgba(255,0,50,.42)] bg-[rgba(255,0,50,.06)]":"border-zinc-800"}`}><p className="font-semibold">{message}</p>{success&&athleteId&&<div className="mt-4 grid gap-2 sm:grid-cols-2"><Link href={`/coach/athletes/${athleteId}`} className="rounded-lg border border-zinc-700 px-4 py-3 text-center font-semibold">Open Athlete</Link><Link href={`/coach/athletes/${athleteId}/workouts/new`} className="phat-accent-bg rounded-lg px-4 py-3 text-center font-semibold">Add First Workout</Link></div>}</section>}<Link href="/coach" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">Back to Coach Dashboard</Link></main>;
}
