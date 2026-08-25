"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Workout = { id: string; name: string; description: string | null; created_at: string; sort_order: number | null };

function athleteFacingDescription(description: string | null) {
  if (!description) return null;
  if (/^Imported by coach\s+[0-9a-f-]{20,}$/i.test(description.trim())) return "Assigned by your coach";
  return description;
}

export default function WorkoutsPage() {
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [message, setMessage] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Workout | null>(null);

  const loadWorkouts = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/auth"; return; }
    const { data, error } = await supabase.from("workouts").select("id, name, description, created_at, sort_order").eq("athlete_user_id", user.id).eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
    if (error) setMessage(error.message);
    setWorkouts((data ?? []) as Workout[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadWorkouts(); }, [loadWorkouts]);

  async function archiveWorkout(workout: Workout) {
    setWorkingId(workout.id); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/auth"; return; }
    const { data: activeSession } = await supabase.from("workout_sessions").select("id").eq("athlete_user_id", user.id).eq("workout_id", workout.id).eq("status", "in_progress").limit(1).maybeSingle();
    if (activeSession) { setMessage(`PHATBOT cannot archive ${workout.name} while a session from that workout is still active. Complete or resume it first.`); setWorkingId(null); setArchiveTarget(null); return; }
    const { error } = await supabase.from("workouts").update({ is_active: false }).eq("id", workout.id).eq("athlete_user_id", user.id);
    if (error) setMessage(error.message); else { setMessage(`Beep boop. ${workout.name} archived. Your completed workout history and reports are still safe.`); await loadWorkouts(); }
    setWorkingId(null); setArchiveTarget(null);
  }

  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Beep boop... loading workout templates.</main>;

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-10">
    <header className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p><h1 className="mt-2 text-3xl font-bold">My Workouts</h1><p className="mt-2 text-zinc-300">Choose a template or build a new training day.</p></div><Link href="/" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Home</Link></header>
    {message && <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-200">{message}</p>}
    {archiveTarget && <section className="rounded-2xl border border-zinc-600 p-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Archive Confirmation</p><h2 className="mt-2 text-xl font-bold">Retire {archiveTarget.name}?</h2><p className="mt-2 text-sm leading-6 text-zinc-300">This removes the template from My Workouts, but it does not delete completed sessions, reports, scores, PRs, or trend history.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button disabled={workingId!==null} onClick={() => setArchiveTarget(null)} className="rounded-lg border border-zinc-700 px-4 py-3 font-semibold disabled:opacity-50">Keep Workout</button><button disabled={workingId!==null} onClick={() => archiveWorkout(archiveTarget)} className="rounded-lg bg-white px-4 py-3 font-bold text-black disabled:opacity-50">{workingId===archiveTarget.id?"Archiving...":"Archive Workout"}</button></div></section>}
    {workouts.length === 0 ? <section className="rounded-2xl border border-zinc-800 p-8 text-center"><h2 className="text-2xl font-semibold">No active workouts</h2><p className="mx-auto mt-3 max-w-md text-zinc-400">Create a workout template to start tracking progress and building workout history.</p><Link href="/workouts/new" className="mt-6 inline-block rounded-lg bg-white px-5 py-3 font-semibold text-black">+ Create Workout</Link></section> : <section className="flex flex-col gap-4">{workouts.map((workout) => { const description = athleteFacingDescription(workout.description); return <article key={workout.id} className="rounded-xl border border-zinc-800 p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{workout.name}</h2>{description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}<button disabled={workingId!==null} onClick={() => setArchiveTarget(workout)} className="mt-4 text-sm text-zinc-500 hover:text-white disabled:opacity-40">Archive workout</button></div><Link href={`/workouts/${workout.id}`} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">View</Link></div></article>; })}<Link href="/workouts/new" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">+ Create Workout</Link></section>}
  </main>;
}