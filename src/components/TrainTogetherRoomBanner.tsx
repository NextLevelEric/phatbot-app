"use client";

import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import {createSupabaseBrowserClient} from "@/lib/supabase";

type RoomState={room_name:string|null;join_code:string;status:string};

export default function TrainTogetherRoomBanner(){
 const pathname=usePathname();
 const match=pathname.match(/^\/sessions\/([0-9a-f-]+)$/i);
 const sessionId=match?.[1]??null;
 const[room,setRoom]=useState<RoomState|null>(null);
 useEffect(()=>{if(!sessionId)return;let active=true;const s=createSupabaseBrowserClient();void (async()=>{const{data:{user}}=await s.auth.getUser();if(!user||!active)return;const{data:membership}=await s.from("live_workout_room_members").select("room_id").eq("athlete_user_id",user.id).eq("workout_session_id",sessionId).maybeSingle();if(!membership?.room_id||!active)return;const{data:roomData}=await s.from("live_workout_rooms").select("room_name,join_code,status").eq("id",membership.room_id).maybeSingle();if(active&&roomData)setRoom(roomData as RoomState);})();return()=>{active=false};},[sessionId]);
 if(!sessionId||!room)return null;
 return <section className="mx-auto w-full max-w-2xl px-4 pt-4 sm:px-6"><div className="rounded-2xl border border-[#ff0032]/50 bg-[#ff0032]/5 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Train Together · Connected</p><p className="mt-1 text-lg font-black">{room.room_name||"Live Workout Room"}</p></div><span className="rounded-full border border-[#ff0032]/40 bg-black px-3 py-1 text-xs font-black text-[#ff0032]">IN ROOM</span></div><p className="mt-2 text-sm text-zinc-400">Your workout is linked to this room. Log your own sets normally; the room race updates separately.</p></div></section>;
}
