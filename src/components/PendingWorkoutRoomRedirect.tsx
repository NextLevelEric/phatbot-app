"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {createSupabaseBrowserClient} from "@/lib/supabase";
const KEY="phatbot:pending-room-code";
export default function PendingWorkoutRoomRedirect(){const pathname=usePathname();useEffect(()=>{if(pathname.startsWith("/auth")||pathname.startsWith("/train-together/"))return;let active=true;(async()=>{let code="";try{code=localStorage.getItem(KEY)??""}catch{}if(!code)return;const s=createSupabaseBrowserClient(),{data:{user}}=await s.auth.getUser();if(!active||!user)return;try{localStorage.removeItem(KEY)}catch{}window.location.href=`/train-together/${encodeURIComponent(code)}`})();return()=>{active=false}},[pathname]);return null}
