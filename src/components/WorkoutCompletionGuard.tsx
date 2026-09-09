"use client";

import {useEffect} from "react";
import {usePathname} from "next/navigation";

export default function WorkoutCompletionGuard(){
 const pathname=usePathname();
 useEffect(()=>{
  if(!/^\/sessions\/[0-9a-f-]+$/i.test(pathname))return;
  const guard=(event:MouseEvent)=>{
   const target=event.target as HTMLElement|null;
   const button=target?.closest("button");
   if(!button)return;
   const label=(button.textContent??"").trim().replace(/\s+/g," ").toLowerCase();
   if(!label.includes("complete workout"))return;
   const confirmed=window.confirm("Complete this workout?\n\nThis will close the workout and generate your PHATBOT report. Choose Cancel if you still need to add or edit sets.");
   if(!confirmed){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();}
  };
  document.addEventListener("click",guard,true);
  return()=>document.removeEventListener("click",guard,true);
 },[pathname]);
 return null;
}
