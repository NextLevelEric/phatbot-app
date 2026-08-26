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

   const {data:sessions,error:sessionError}=await supabase
    .from("workout_sessions")
    .select("id")
    .eq("athlete_user_id",athleteUserId)
    .eq("status","completed");
   if(sessionError||cancelled||!sessions?.length)return;

   const sessionIds=sessions.map(row=>row.id);
   const [exerciseCountResult,scoreCountResult,exerciseScoreResult,workoutScoreResult]=await Promise.all([
    supabase.from("exercise_sessions").select("id",{count:"exact",head:true}).in("workout_session_id",sessionIds),
    supabase.from("exercise_scores").select("id",{count:"exact",head:true}).eq("athlete_user_id",athleteUserId),
    supabase.from("exercise_scores").select("workout_session_id,result").eq("athlete_user_id",athleteUserId).in("workout_session_id",sessionIds),
    supabase.from("workout_scores").select("workout_session_id").eq("athlete_user_id",athleteUserId).in("workout_session_id",sessionIds),
   ]);
   if(exerciseCountResult.error||scoreCountResult.error||exerciseScoreResult.error||workoutScoreResult.error||cancelled)return;

   const exerciseCount=exerciseCountResult.count??0;
   const scoreCount=scoreCountResult.count??0;
   const exerciseScores=exerciseScoreResult.data??[];
   const scoredWorkoutIds=new Set((workoutScoreResult.data??[]).map(row=>row.workout_session_id));
   const comparableWorkoutIds=new Set(exerciseScores.filter(row=>row.result!=="baseline").map(row=>row.workout_session_id));
   const missingExerciseScores=exerciseCount!==scoreCount;
   const missingWorkoutScores=[...comparableWorkoutIds].some(id=>!scoredWorkoutIds.has(id));

   if(!missingExerciseScores&&!missingWorkoutScores)return;

   try{
    await backfillHistoricalIntelligence(supabase,athleteUserId);
    if(!cancelled&&pathname==="/progress")window.location.reload();
   }catch(error){
    // Do not interrupt the workout/report experience; the next eligible page load can retry.
    console.error("PHATBOT could not backfill derived training intelligence",error);
   }
  }
  sync();
  return()=>{cancelled=true;};
 },[]);
 return null;
}
