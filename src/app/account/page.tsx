"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import HealthConnectionCard from "@/components/HealthConnectionCard";

export default function AccountPage() {
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [displayName,setDisplayName]=useState("");
  const [preferredUnit,setPreferredUnit]=useState<"lb"|"kg">("lb");
  const [trainingPhase,setTrainingPhase]=useState<"maintenance"|"cut">("maintenance");
  const [timezone,setTimezone]=useState("America/New_York");
  const [email,setEmail]=useState("");
  const [message,setMessage]=useState("");
  const [addingEric,setAddingEric]=useState(false);
  const [ericIsCoach,setEricIsCoach]=useState(false);
  const [coachAdmin,setCoachAdmin]=useState(false);

  useEffect(()=>{const supabase=createSupabaseBrowserClient();async function load(){const{data:{user}}=await supabase.auth.getUser();if(!user){window.location.href="/auth";return;}setEmail(user.email??"");const[{data:profile},{data:athlete},{data:admin},{data:links}]=await Promise.all([
    supabase.from("profiles").select("display_name").eq("id",user.id).single(),
    supabase.from("athlete_profiles").select("preferred_unit,timezone,training_phase").eq("user_id",user.id).single(),
    supabase.from("coach_profiles").select("dashboard_enabled").eq("user_id",user.id).maybeSingle(),
    supabase.from("coach_athletes").select("coach_user_id,active").eq("athlete_user_id",user.id).eq("active",true)
  ]);setDisplayName(profile?.display_name??"");setPreferredUnit(athlete?.preferred_unit==="kg"?"kg":"lb");setTrainingPhase(athlete?.training_phase==="cut"?"cut":"maintenance");setTimezone(athlete?.timezone??"America/New_York");setCoachAdmin(Boolean(admin?.dashboard_enabled));
    const ids=(links??[]).map((x:any)=>x.coach_user_id);if(ids.length){const{data:names}=await supabase.from("profiles").select("id,display_name").in("id",ids);setEricIsCoach(Boolean((names??[]).some((x:any)=>x.display_name==="Eric Parent")));}
    setLoading(false);}void load();},[]);

  async function saveProfile(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setMessage("");const supabase=createSupabaseBrowserClient();const{data:{user}}=await supabase.auth.getUser();if(!user){window.location.href="/auth";return;}const[p,a]=await Promise.all([supabase.from("profiles").update({display_name:displayName.trim()||null}).eq("id",user.id),supabase.from("athlete_profiles").update({preferred_unit:preferredUnit,timezone:timezone.trim()||"America/New_York",training_phase:trainingPhase}).eq("user_id",user.id)]);setSaving(false);if(p.error||a.error){setMessage("PHATBOT could not save your profile right now. Please try again.");return;}setMessage(`Beep boop. Profile saved. PHATBOT will coach this phase as ${trainingPhase==="cut"?"a cut":"maintenance"}.`);}

  async function addEric(){setAddingEric(true);setMessage("");const supabase=createSupabaseBrowserClient();const{error}=await supabase.rpc("add_eric_as_my_coach");setAddingEric(false);if(error){console.error("PHATBOT could not connect Eric as coach",error);setMessage("PHATBOT could not add Eric as your coach right now. Please try again.");return;}setEricIsCoach(true);setMessage("Eric is now connected as your PHATBOT coach.");}
  async function signOut(){const supabase=createSupabaseBrowserClient();await supabase.auth.signOut();window.location.href="/";}

  if(loading)return <main className="mx-auto min-h-screen max-w-xl px-6 py-12 text-zinc-300">Beep boop... loading account controls.</main>;
  return <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
    <header className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><img src="/branding/PHATbot%20ICON.png" alt="PHATBOT" className="mt-1 h-10 w-10 shrink-0 object-contain"/><div><p className="phat-accent text-sm font-semibold uppercase tracking-[0.25em]">PHATBOT Account</p><h1 className="mt-2 text-3xl font-bold">Profile & Settings</h1><p className="mt-2 text-zinc-300">Manage athlete preferences, coaching access, health connections, and account security.</p></div></div><Link href="/" className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Dashboard</Link></header>
    <form onSubmit={saveProfile} className="flex flex-col gap-5 rounded-2xl border border-zinc-800 p-5"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Athlete Settings</p><h2 className="mt-1 text-xl font-semibold">Profile</h2></div><label className="flex flex-col gap-2 text-sm font-medium">Email<input disabled value={email} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-400"/></label><label className="flex flex-col gap-2 text-sm font-medium">Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none"/></label><label className="flex flex-col gap-2 text-sm font-medium">Weight unit<select value={preferredUnit} onChange={e=>setPreferredUnit(e.target.value as "lb"|"kg")} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none"><option value="lb">Pounds (lb)</option><option value="kg">Kilograms (kg)</option></select><span className="font-normal leading-5 text-zinc-500">Changing this label does not convert older workout numbers, protecting your existing training history.</span></label><label className="flex flex-col gap-2 text-sm font-medium">Training phase<select value={trainingPhase} onChange={e=>setTrainingPhase(e.target.value as "maintenance"|"cut")} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none"><option value="maintenance">Maintenance</option><option value="cut">Cut / Fat Loss</option></select></label><label className="flex flex-col gap-2 text-sm font-medium">Timezone<input value={timezone} onChange={e=>setTimezone(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none"/></label><button disabled={saving} className="phat-accent-bg rounded-lg px-5 py-3 font-semibold disabled:opacity-60">{saving?"Saving...":"Save Athlete Profile"}</button></form>
    <HealthConnectionCard/>
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 p-5"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Coaching</p><h2 className="mt-1 text-xl font-semibold">Train with Eric</h2><p className="mt-1 text-sm leading-6 text-zinc-400">Connect Eric Parent / The Smooth Bear as your PHATBOT coach for programming, coaching feedback, and the Smooth Bear training system.</p></div>{ericIsCoach?<div className="rounded-xl border border-[#ff0032]/40 bg-[#ff0032]/5 p-4"><p className="text-xs font-black uppercase tracking-[.16em] text-[#ff0032]">Connected</p><p className="mt-1 text-lg font-black">Eric Parent · The Smooth Bear</p><p className="mt-1 text-sm text-zinc-400">Eric is your active PHATBOT coach.</p></div>:<button type="button" onClick={()=>void addEric()} disabled={addingEric} className="phat-accent-bg rounded-lg px-4 py-3 font-semibold disabled:opacity-60">{addingEric?"Connecting...":"Add Eric as My Coach"}</button>}</section>
    {coachAdmin&&<section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 p-5"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">PHATBOT Admin</p><h2 className="mt-1 text-xl font-semibold">Coach Tools</h2><p className="mt-1 text-sm text-zinc-400">Approved coach administration for PHATBOT.</p></div><div className="grid gap-2 sm:grid-cols-2"><Link href="/coach" className="phat-accent-bg rounded-lg px-4 py-3 text-center font-semibold">Open Coach Dashboard</Link><Link href="/coach/invitations" className="rounded-lg border border-zinc-700 px-4 py-3 text-center font-semibold">Athlete Invitations</Link></div></section>}
    {message&&<p className="phat-signal rounded-lg border p-3 text-sm text-zinc-200">{message}</p>}
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 p-5"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Account Access</p><h2 className="mt-1 text-xl font-semibold">Security</h2></div><Link href="/auth/reset" className="rounded-lg border border-zinc-700 px-4 py-3 text-center font-semibold">Change Password</Link><button onClick={signOut} className="rounded-lg border border-zinc-700 px-4 py-3 font-semibold text-zinc-300 hover:border-zinc-500 hover:text-white">Sign Out</button></section>
  </main>;
}
