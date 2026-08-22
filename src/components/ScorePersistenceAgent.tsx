"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { backfillHistoricalIntelligence } from "@/features/import/backfillHistoricalIntelligence";

export default function ScorePersistenceAgent(){
 useEffect(()=>{
  let cancelled=false;
  async function sync(){
   const supabase=createSupabaseBrowserClient();
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||cancelled)return;

   const pathname=window.location.pathname;
   const coachAthleteMatch=pathname.match(/^\/coach\/athletes\/([^/]+)/);
   const excluded=pathname.startsWith("/auth")||pathname.startsWith("/admin")||pathname.startsWith("/coach/import")||pathname.startsWith("/coach/invitations");
   const athleteUserId=coachAthleteMatch?.[1]??(!excluded?user.id:null);
   if(!athleteUserId)return;

   // Every completed exercise session should eventually have a stored exercise score,
   // including baseline rows. If imported or newly-completed history is missing derived
   // intelligence, replay the athlete's complete timeline once and persist it securely.
   const {data:sessions,error:sessionError}=await supabase
    .from("workout_sessions")
    .select("id")
    .eq("athlete_user_id",athleteUserId)
    .eq("status","completed");
   if(sessionError||cancelled||!sessions?.length)return;

   const sessionIds=sessions.map(row=>row.id);
   const [{count:exerciseCount,error:exerciseError},{count:scoreCount,error:scoreError}]=await Promise.all([
    supabase.from("exercise_sessions").select("id",{count:"exact",head:true}).in("workout_session_id",sessionIds),
    supabase.from("exercise_scores").select("id",{count:"exact",head:true}).eq("athlete_user_id",athleteUserId),
   ]);
   if(exerciseError||scoreError||cancelled)return;
   if((exerciseCount??0)===(scoreCount??0))return;

   try{
    await backfillHistoricalIntelligence(supabase,athleteUserId);
   }catch(error){
    // The migration may not be installed yet in a development environment. Do not
    // interrupt the workout/report experience; the next eligible page load can retry.
    console.error("PHATBOT could not backfill derived training intelligence",error);
   }
  }
  sync();
  return()=>{cancelled=true;};
 },[]);
 return null;
}
