"use client";

import { useEffect,useState } from "react";
import WorkoutWinShareCard from "@/components/WorkoutWinShareCard";

type ShareData={workout:string;score:string|null;volume:string|null;prs:{exercise:string;result:string}[]};

function readReport():ShareData|null{
  const main=document.querySelector("main");
  if(!main)return null;
  const text=main.textContent??"";
  if(!text.includes("PHATBOT Workout Report"))return null;
  const workout=main.querySelector("h1")?.textContent?.trim()??"Workout";
  const score=text.match(/Progressive Overload Score\s*(BASELINE|\d+%)/i)?.[1]??null;
  const volume=text.match(/Training Volume vs Last Workout\s*(N\/A|[+-]?\d+(?:\.\d+)?%)/i)?.[1]??null;
  const prs:{exercise:string;result:string}[]=[];
  const prHeading=[...main.querySelectorAll("h2")].find(h=>/\d+\s+PRs? today/i.test(h.textContent??""));
  const prSection=prHeading?.closest("section")??null;
  if(prSection){
    for(const card of [...prSection.querySelectorAll(":scope > div > div")]){
      const lines=[...card.querySelectorAll("p")].map(p=>p.textContent?.trim()??"").filter(Boolean);
      if(lines.length>=2)prs.push({exercise:lines[0],result:lines[1]});
    }
  }
  if(prs.length===0){
    const win=[...main.querySelectorAll("section")].find(s=>(s.textContent??"").includes("PHATBOT WIN CARD"));
    if(win){
      const exercise=win.querySelector("h2")?.textContent?.trim()??"Personal Record";
      const result=[...win.querySelectorAll("p")].map(p=>p.textContent?.trim()??"").find(v=>/\d+\s*(lb|kg)\s*[×x]\s*\d+/i.test(v))??"New PR";
      prs.push({exercise,result});
    }
  }
  return {workout,score,volume,prs};
}

export default function ReportShareActions(){
  const[data,setData]=useState<ShareData|null>(null);
  useEffect(()=>{
    let stopped=false;
    const refresh=()=>{if(stopped)return;const next=readReport();if(next)setData(next)};
    refresh();
    const observer=new MutationObserver(refresh);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    const interval=window.setInterval(refresh,500);
    return()=>{stopped=true;observer.disconnect();window.clearInterval(interval)};
  },[]);
  if(!data)return null;
  const isWin=(data.score&&data.score!=="BASELINE"&&parseFloat(data.score)>50)||(data.volume&&data.volume!=="N/A"&&parseFloat(data.volume)>0);
  return <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-28 sm:px-6">
    {data.prs.map((pr,i)=><WorkoutWinShareCard key={`${pr.exercise}-${i}`} kind="pr" workoutName={data.workout} headline={pr.exercise} result={pr.result} detail="Personal record detected by PHATBOT"/>)}
    {isWin&&<WorkoutWinShareCard kind="workout" workoutName={data.workout} headline="WORKOUT WIN" result={data.volume&&data.volume!=="N/A"?`${data.volume} volume`:data.score??"Improved"} detail={data.score?`Progressive Overload Score: ${data.score}`:"PHATBOT detected improvement"}/>} 
    {!data.prs.length&&!isWin&&<section className="rounded-2xl border border-zinc-800 p-4 text-sm text-zinc-500"><span className="font-black text-zinc-300">No shareable win detected on this report.</span></section>}
  </div>
}
