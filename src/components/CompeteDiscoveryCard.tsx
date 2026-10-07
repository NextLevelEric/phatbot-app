"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Mode = "private" | "profile" | "custom";

export default function CompeteDiscoveryCard({ athleteUserId }: { athleteUserId: string }) {
  const router = useRouter();
  const [show,setShow]=useState(false),[open,setOpen]=useState(false),[mode,setMode]=useState<Mode>("profile"),[name,setName]=useState(""),[profileName,setProfileName]=useState(""),[saving,setSaving]=useState(false),[message,setMessage]=useState("");

  useEffect(()=>{let active=true;void(async()=>{const s=createSupabaseBrowserClient();const[{data:ap},{data:p},{count}]=await Promise.all([
    s.from("athlete_profiles").select("leaderboard_identity_mode,leaderboard_name,leaderboard_identity_decided_at").eq("user_id",athleteUserId).maybeSingle(),
    s.from("profiles").select("display_name").eq("id",athleteUserId).maybeSingle(),
    s.from("competition_entries").select("id",{count:"exact",head:true}).eq("athlete_user_id",athleteUserId),
  ]);if(!active)return;setProfileName(p?.display_name??"");setName(ap?.leaderboard_name??"");setMode(ap?.leaderboard_identity_mode==="custom"?"custom":ap?.leaderboard_identity_mode==="profile"?"profile":"profile");setShow(ap?.leaderboard_identity_mode==="private"&&!ap?.leaderboard_identity_decided_at&&(count??0)>0);})();return()=>{active=false}},[athleteUserId]);

  async function choose(next:Mode){if(next==="custom"){setMode("custom");return;}setSaving(true);setMessage("");const s=createSupabaseBrowserClient();const now=new Date().toISOString();const{error}=await s.from("athlete_profiles").update({leaderboard_identity_mode:next,leaderboard_name:null,leaderboard_identity_decided_at:now,updated_at:now}).eq("user_id",athleteUserId);setSaving(false);if(error){setMessage("PHATBOT couldn't save that choice. Try again.");return;}setShow(false);if(next==="private")return;router.push("/compete");}
  async function saveCustom(){if(!name.trim())return;setSaving(true);setMessage("");const s=createSupabaseBrowserClient();const now=new Date().toISOString();const{error}=await s.from("athlete_profiles").update({leaderboard_identity_mode:"custom",leaderboard_name:name.trim(),leaderboard_identity_decided_at:now,updated_at:now}).eq("user_id",athleteUserId);setSaving(false);if(error){setMessage("PHATBOT couldn't save that name. Try again.");return;}setShow(false);router.push("/compete");}

  if(!show)return null;
  return <section className="overflow-hidden rounded-3xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 via-zinc-950 to-black p-5">
    <p className="text-xs font-black uppercase tracking-[.2em] text-yellow-400">You’re in the race</p>
    <h2 className="mt-2 text-2xl font-black">PHATBOT is already scoring you.</h2>
    <p className="mt-2 text-sm leading-6 text-zinc-400">Your training is eligible for Beast, Eager Beaver and the PHATBOT leaderboards. Choose how other athletes see you—or stay private.</p>
    {!open?<button type="button" onClick={()=>setOpen(true)} className="mt-4 w-full rounded-2xl bg-white px-5 py-4 font-black text-black">CHOOSE HOW I SHOW UP →</button>:<div className="mt-5 space-y-3">
      <button disabled={saving} onClick={()=>void choose("profile")} className="w-full rounded-2xl border border-zinc-700 p-4 text-left"><p className="font-black">Use my profile name</p><p className="mt-1 text-xs text-zinc-500">{profileName||"Your profile name"} will appear on leaderboards.</p></button>
      <div className="rounded-2xl border border-zinc-700 p-4"><button type="button" onClick={()=>setMode("custom")} className="w-full text-left"><p className="font-black">Choose a competition name</p><p className="mt-1 text-xs text-zinc-500">Use a nickname just for PHATBOT competition.</p></button>{mode==="custom"&&<div className="mt-3 flex gap-2"><input value={name} onChange={e=>setName(e.target.value.slice(0,32))} maxLength={32} placeholder="e.g. Smooth Bear" className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-black px-3 py-3 text-sm outline-none focus:border-[#ff0032]"/><button disabled={saving||!name.trim()} onClick={()=>void saveCustom()} className="rounded-xl bg-white px-4 text-xs font-black text-black disabled:opacity-40">SAVE</button></div>}</div>
      <button disabled={saving} onClick={()=>void choose("private")} className="w-full rounded-2xl border border-zinc-800 p-4 text-left"><p className="font-black text-zinc-300">Stay private</p><p className="mt-1 text-xs text-zinc-600">Others keep seeing “PHATBOT Athlete.” We won’t keep asking.</p></button>
      {message&&<p className="text-center text-xs text-red-300">{message}</p>}
    </div>}
  </section>;
}
