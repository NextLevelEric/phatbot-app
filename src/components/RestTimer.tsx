"use client";

import { useEffect, useMemo, useState } from "react";

const PRESETS = [60, 90, 120];

function formatTime(seconds:number){
  const safe=Math.max(0,seconds);
  const minutes=Math.floor(safe/60);
  const secs=safe%60;
  return `${minutes}:${String(secs).padStart(2,"0")}`;
}

export default function RestTimer(){
  const [open,setOpen]=useState(false);
  const [duration,setDuration]=useState(90);
  const [remaining,setRemaining]=useState(90);
  const [running,setRunning]=useState(false);

  useEffect(()=>{
    if(!running)return;
    const id=window.setInterval(()=>{
      setRemaining(current=>{
        if(current<=1){
          window.clearInterval(id);
          setRunning(false);
          try{navigator.vibrate?.([120,80,120]);}catch{}
          return 0;
        }
        return current-1;
      });
    },1000);
    return()=>window.clearInterval(id);
  },[running]);

  const label=useMemo(()=>running||remaining!==duration?formatTime(remaining):"Rest timer",[running,remaining,duration]);

  function choosePreset(seconds:number){
    setDuration(seconds);
    setRemaining(seconds);
    setRunning(false);
  }

  function start(){
    if(remaining<=0)setRemaining(duration);
    setRunning(true);
  }

  function reset(){
    setRunning(false);
    setRemaining(duration);
  }

  return <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end sm:bottom-6 sm:right-6">
    {open&&<div className="mb-2 w-64 rounded-2xl border border-zinc-800 bg-black/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-zinc-500">Optional</p>
          <h2 className="mt-1 text-lg font-black">Set Break Timer</h2>
        </div>
        <button onClick={()=>setOpen(false)} className="text-sm text-zinc-500">Close</button>
      </div>
      <div className="mt-4 text-center text-4xl font-black tabular-nums">{formatTime(remaining)}</div>
      <div className="mt-4 grid grid-cols-3 gap-2">{PRESETS.map(seconds=><button key={seconds} onClick={()=>choosePreset(seconds)} className={`rounded-xl border px-3 py-2 text-sm font-bold ${duration===seconds?"border-[#ff0032] text-[#ff0032]":"border-zinc-800 text-zinc-400"}`}>{seconds/60%1===0?`${seconds/60}m`:`${seconds}s`}</button>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={running?()=>setRunning(false):start} className="rounded-xl bg-[#ff0032] px-4 py-3 font-black text-white">{running?"Pause":"Start"}</button><button onClick={reset} className="rounded-xl border border-zinc-800 px-4 py-3 font-bold text-zinc-400">Reset</button></div>
      <p className="mt-3 text-xs leading-5 text-zinc-600">Nothing starts automatically. Ignore this completely if you don't train with timed rests.</p>
    </div>}
    <button onClick={()=>setOpen(value=>!value)} className={`rounded-full border px-4 py-2 text-sm font-bold shadow-lg backdrop-blur ${running?"border-[#ff0032] bg-black text-[#ff0032]":"border-zinc-800 bg-black/85 text-zinc-400"}`}>⏱ {label}</button>
  </div>;
}
