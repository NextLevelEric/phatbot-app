"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Program = { program_id:string; name:string; description:string|null; version:number; day_count:number; enrolled:boolean };

export default function EricCurrentProgramCard() {
  const pathname = usePathname();
  const [program,setProgram] = useState<Program|null>(null);
  const [eligible,setEligible] = useState(false);
  const [working,setWorking] = useState(false);
  const [message,setMessage] = useState("");

  useEffect(()=>{
    if(pathname!=="/workouts") return;
    const supabase=createSupabaseBrowserClient();
    void (async()=>{
      const { data: { user } } = await supabase.auth.getUser();
      if(!user) return;
      const { data: athlete } = await supabase.from("athlete_profiles").select("show_eric_program_onboarding").eq("user_id",user.id).maybeSingle();
      if(!athlete?.show_eric_program_onboarding) return;
      setEligible(true);
      const {data,error}=await supabase.rpc("get_current_eric_program");
      if(!error && data?.[0]) setProgram(data[0] as Program);
    })();
  },[pathname]);

  if(pathname!=="/workouts" || !eligible || !program) return null;

  async function enroll(){
    setWorking(true); setMessage("");
    const supabase=createSupabaseBrowserClient();
    const {error}=await supabase.rpc("enroll_in_current_eric_program");
    if(error){setMessage(error.message);setWorking(false);return;}
    setProgram(current=>current?{...current,enrolled:true}:current);
    setMessage("Eric's six-day program is locked and loaded.");
    setWorking(false);
    window.setTimeout(()=>window.location.reload(),650);
  }

  return <section className="mx-auto w-full max-w-2xl px-4 pt-6 sm:px-6">
    <div className="overflow-hidden rounded-3xl border border-[rgba(255,0,50,.42)] bg-gradient-to-b from-zinc-900 to-black p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">Train with Eric</p>
          <h2 className="mt-2 text-2xl font-black">The Smooth Bear&apos;s Current Program</h2>
          <p className="mt-2 text-sm text-zinc-400">{program.day_count}-Day Mesocycle · Progressive Overload</p>
        </div>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#ff0032]/50 bg-[#ff0032]/10 text-xl">🐻</div>
      </div>
      <p className="mt-4 text-sm leading-6 text-zinc-300">Do the same current training block Eric is running. Your weights, reps, history, and PHATBOT scores stay completely your own.</p>
      {program.enrolled ? <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-black/50 p-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#ff0032]">Current Program</p><p className="mt-1 font-bold">You&apos;re training with Eric.</p></div><span className="text-xl">✓</span></div> : <button onClick={()=>void enroll()} disabled={working} className="mt-5 w-full rounded-2xl bg-[#ff0032] px-5 py-4 font-black text-white disabled:opacity-60">{working?"Loading Eric's program...":"START ERIC'S PROGRAM"}</button>}
      {message&&<p className="mt-3 text-sm text-zinc-400">{message}</p>}
      <div className="mt-4 flex justify-center"><Link href="/workouts/new" className="text-sm font-bold text-zinc-500">Or build my own workout →</Link></div>
    </div>
  </section>;
}
