"use client";

import {useEffect,useMemo,useState} from "react";
import {usePathname} from "next/navigation";
import {createSupabaseBrowserClient} from "@/lib/supabase";
import TrainTogetherCard from "@/components/TrainTogetherCard";

const PRESETS=[60,90,120];
const fmt=(s:number)=>`${Math.floor(Math.max(0,s)/60)}:${String(Math.max(0,s)%60).padStart(2,"0")}`;
type SessionMeta={started_at:string;workout_id:string|null;workout_name_snapshot:string};
type Room={room_name:string|null;join_code:string;status:string};

export default function LiveWorkoutMenu(){
 const pathname=usePathname();
 const sessionId=pathname.match(/^\/sessions\/([0-9a-f-]+)$/i)?.[1]??null;
 const[open,setOpen]=useState(false);
 const[session,setSession]=useState<SessionMeta|null>(null);
 const[elapsed,setElapsed]=useState(0);
 const[duration,setDuration]=useState(90);
 const[remaining,setRemaining]=useState(90);
 const[running,setRunning]=useState(false);
 const[room,setRoom]=useState<Room|null>(null);

 useEffect(()=>{if(!sessionId)return;let active=true;const s=createSupabaseBrowserClient();void(async()=>{
  const[{data:sessionData},{data:{user}}]=await Promise.all([s.from("workout_sessions").select("started_at,workout_id,workout_name_snapshot").eq("id",sessionId).maybeSingle(),s.auth.getUser()]);
  if(active&&sessionData)setSession(sessionData as SessionMeta);
  if(!user||!active)return;
  const{data:m}=await s.from("live_workout_room_members").select("room_id").eq("athlete_user_id",user.id).eq("workout_session_id",sessionId).maybeSingle();
  if(!m?.room_id||!active)return;
  const{data:r}=await s.from("live_workout_rooms").select("room_name,join_code,status").eq("id",m.room_id).maybeSingle();if(active&&r)setRoom(r as Room);
 })();return()=>{active=false};},[sessionId]);

 useEffect(()=>{if(!session?.started_at)return;const tick=()=>setElapsed(Math.max(0,Math.floor((Date.now()-new Date(session.started_at).getTime())/1000)));tick();const id=window.setInterval(tick,1000);return()=>clearInterval(id);},[session?.started_at]);
 useEffect(()=>{if(!running)return;const id=window.setInterval(()=>setRemaining(v=>{if(v<=1){clearInterval(id);setRunning(false);try{navigator.vibrate?.([120,80,120]);}catch{}return 0;}return v-1;}),1000);return()=>clearInterval(id);},[running]);
 const workoutTime=useMemo(()=>`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,"0")}`,[elapsed]);
 const choose=(v:number)=>{setDuration(v);setRemaining(v);setRunning(false)};
 const start=()=>{if(remaining<=0)setRemaining(duration);setRunning(true)};

 if(!sessionId)return null;
 return <div className="fixed bottom-24 right-4 z-50 sm:bottom-6 sm:right-6">
  {open&&<div className="mb-2 max-h-[calc(100dvh-9rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-zinc-800 bg-black/95 p-4 shadow-2xl backdrop-blur">
   <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff0032]">Live Workout</p><h2 className="mt-1 text-lg font-black">Workout Tools</h2></div><button onClick={()=>setOpen(false)} className="text-sm text-zinc-500">Close</button></div>
   <div className="mt-4 rounded-xl border border-zinc-800 p-3"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Workout Time</p><p className="mt-1 text-sm text-zinc-400">Passive elapsed time</p></div><span className="text-2xl font-black tabular-nums">{workoutTime}</span></div></div>
   <div className="mt-3 rounded-xl border border-zinc-800 p-3"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Rest Timer</p><p className="mt-1 text-sm text-zinc-400">Optional · never auto-starts</p></div><span className={running?"text-xl font-black tabular-nums text-[#ff0032]":"text-xl font-black tabular-nums"}>{fmt(remaining)}</span></div><div className="mt-3 grid grid-cols-3 gap-2">{PRESETS.map(v=><button key={v} onClick={()=>choose(v)} className={`rounded-lg border py-2 text-sm font-bold ${duration===v?"border-[#ff0032] text-[#ff0032]":"border-zinc-800 text-zinc-400"}`}>{v===60?"1m":v===90?"90s":"2m"}</button>)}</div><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={running?()=>setRunning(false):start} className="rounded-lg bg-[#ff0032] py-2 text-sm font-black text-white">{running?"Pause":"Start"}</button><button onClick={()=>{setRunning(false);setRemaining(duration)}} className="rounded-lg border border-zinc-800 py-2 text-sm font-bold text-zinc-400">Reset</button></div></div>
   {session&&<div className="mt-3"><TrainTogetherCard sessionId={sessionId} workoutId={session.workout_id} workoutName={session.workout_name_snapshot}/></div>}
  </div>}
  <button onClick={()=>setOpen(v=>!v)} className={`rounded-full border bg-black/90 px-4 py-2 text-sm font-black shadow-lg backdrop-blur ${running||room?"border-[#ff0032]/60 text-white":"border-zinc-800 text-zinc-400"}`}><span aria-hidden>☰</span> {running?`Rest ${fmt(remaining)}`:room?"Live Workout · In Room":"Live Workout"}</button>
 </div>;
}
