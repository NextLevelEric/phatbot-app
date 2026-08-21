"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { AthleteDashboardNav } from "@/components/AthleteDashboardNav";

type Profile = { display_name: string | null };
type WorkoutSession = { id: string; workout_id: string; workout_name_snapshot: string; completed_at: string };
type ActiveWorkout = { id: string; workout_name_snapshot: string; started_at: string };
type CoachFeedback = { workout_session_id: string; feedback: string; updated_at: string; workout_name: string | null };

function startOfWeek() { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); d.setHours(0,0,0,0); return d; }

export default function HomePage() {
  const [loading,setLoading]=useState(true),[signedIn,setSignedIn]=useState(false);
  const [profile,setProfile]=useState<Profile|null>(null),[latestWorkout,setLatestWorkout]=useState<WorkoutSession|null>(null),[activeWorkout,setActiveWorkout]=useState<ActiveWorkout|null>(null);
  const [weeklyCompleted,setWeeklyCompleted]=useState(0),[latestCoachFeedback,setLatestCoachFeedback]=useState<CoachFeedback|null>(null);

  useEffect(()=>{let mounted=true;const supabase=createSupabaseBrowserClient();async function load(){const{data:{user}}=await supabase.auth.getUser();if(!mounted)return;if(!user){setSignedIn(false);setLoading(false);return;}setSignedIn(true);const[pr,lr,ar,wr,fr]=await Promise.all([supabase.from("profiles").select("display_name").eq("id",user.id).single(),supabase.from("workout_sessions").select("id,workout_id,workout_name_snapshot,completed_at").eq("athlete_user_id",user.id).eq("status","completed").order("completed_at",{ascending:false}).limit(1).maybeSingle(),supabase.from("workout_sessions").select("id,workout_name_snapshot,started_at").eq("athlete_user_id",user.id).eq("status","in_progress").order("started_at",{ascending:false}).limit(1).maybeSingle(),supabase.from("workout_sessions").select("id").eq("athlete_user_id",user.id).eq("status","completed").gte("completed_at",startOfWeek().toISOString()),supabase.from("coach_workout_feedback").select("workout_session_id,feedback,updated_at").eq("athlete_user_id",user.id).is("athlete_read_at",null).order("updated_at",{ascending:false}).limit(1).maybeSingle()]);let feedback:CoachFeedback|null=null;if(fr.data){const{data:w}=await supabase.from("workout_sessions").select("workout_name_snapshot").eq("id",fr.data.workout_session_id).eq("athlete_user_id",user.id).maybeSingle();feedback={...fr.data,workout_name:w?.workout_name_snapshot??null} as CoachFeedback;}if(!mounted)return;setProfile(pr.data);setLatestWorkout(lr.data as WorkoutSession|null);setActiveWorkout(ar.data as ActiveWorkout|null);setWeeklyCompleted((wr.data??[]).length);setLatestCoachFeedback(feedback);setLoading(false);}load();const{data:l}=supabase.auth.onAuthStateChange(()=>load());return()=>{mounted=false;l.subscription.unsubscribe();};},[]);
  async function signOut(){const s=createSupabaseBrowserClient();await s.auth.signOut();window.location.href="/";}

  if(loading)return <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12"><p className="text-zinc-300">Beep boop... loading PHATBOT.</p></main>;
  if(!signedIn)return <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12"><div><p className="text-sm font-bold uppercase tracking-[.25em] text-white">PHATBOT</p><h1 className="mt-2 text-4xl font-bold">Did you improve today?</h1><p className="mt-4 text-zinc-300">PHATBOT tracks progressive overload, workout scoring, personal records, and your performance over time.</p></div><Link href="/auth" className="rounded-lg bg-white px-5 py-3 text-center font-semibold text-black">Create Account / Sign In</Link></main>;

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
    <header className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><Link href="/" className="text-base font-bold uppercase tracking-[.25em] text-white">PHATBOT</Link><h1 className="mt-2 text-3xl font-bold">Welcome{profile?.display_name?`, ${profile.display_name}`:""}.</h1><p className="mt-2 text-zinc-300">Track. Compare. Celebrate. Coach. Adjust.</p></div><div className="flex shrink-0 flex-col gap-2 sm:flex-row"><Link href="/account" className="whitespace-nowrap rounded-lg border border-zinc-700 px-3 py-2 text-center text-sm font-semibold sm:px-4">Account</Link><button onClick={signOut} className="whitespace-nowrap rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold sm:px-4">Sign Out</button></div></header>

    {activeWorkout&&<section className="rounded-2xl border border-[#ff0032]/50 bg-[#ff0032]/5 p-5"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff0032]">Active Workout</p><h2 className="mt-2 text-2xl font-bold">{activeWorkout.workout_name_snapshot} is waiting.</h2><p className="mt-2 text-sm text-zinc-300">Your training data is saved. Pick up exactly where you left off.</p><Link href={`/sessions/${activeWorkout.id}`} className="mt-4 block rounded-lg bg-white px-5 py-3 text-center font-bold text-black">Resume Workout</Link></section>}

    {latestCoachFeedback&&<section><p className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-[#ff0032]">PHATBOT Signals</p><Link href={`/sessions/${latestCoachFeedback.workout_session_id}/report`} className="block rounded-2xl border border-zinc-700 p-5 transition hover:border-zinc-500"><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Coach Transmission</p><p className="mt-2 font-bold">New feedback{latestCoachFeedback.workout_name?` on ${latestCoachFeedback.workout_name}`:""}</p><p className="mt-2 line-clamp-2 text-sm text-zinc-300">{latestCoachFeedback.feedback}</p><p className="mt-3 text-sm font-semibold">Read transmission →</p></Link></section>}

    <section className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-zinc-800 p-5"><p className="text-sm text-zinc-400">Latest Workout</p>{latestWorkout?<><p className="mt-2 text-2xl font-semibold">{latestWorkout.workout_name_snapshot}</p><p className="mt-2 text-sm text-zinc-400">Completed {new Date(latestWorkout.completed_at).toLocaleString()}</p><Link href={`/sessions/${latestWorkout.id}/report`} className="mt-4 inline-block text-sm font-semibold underline">View Report →</Link></>:<p className="mt-2 text-2xl font-semibold">No workouts yet</p>}</div><div className="rounded-xl border border-zinc-800 p-5"><p className="text-sm text-zinc-400">This Week</p><p className="mt-2 text-4xl font-black">{weeklyCompleted}</p><p className="mt-1 text-sm text-zinc-400">workout{weeklyCompleted===1?"":"s"} completed</p><Link href="/weekly" className="mt-4 inline-block text-sm font-semibold underline">Open Weekly Report →</Link></div></section>

    <AthleteDashboardNav activeWorkoutId={activeWorkout?.id} latestWorkoutId={latestWorkout?.id}/>
  </main>;
}
