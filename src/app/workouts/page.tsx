"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Workout = { id: string; name: string; description: string | null; created_at: string; sort_order: number | null };
type ActiveWorkout = { id: string; workout_id: string; workout_name_snapshot: string; started_at: string };

function athleteFacingDescription(description: string | null) {
  if (!description) return null;
  if (/^Imported by coach\s+[0-9a-f-]{20,}$/i.test(description.trim())) return "Assigned by your coach";
  return description;
}

function DumbbellIcon() {
  return <svg aria-hidden="true" viewBox="0 0 44 28" className="h-8 w-12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M14 14h16M10 7v14M34 7v14M6 10v8M38 10v8" /></svg>;
}

export default function WorkoutsPage() {
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [message, setMessage] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Workout | null>(null);

  const loadWorkouts = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/auth"; return; }
    const [templates, active] = await Promise.all([
      supabase.from("workouts").select("id, name, description, created_at, sort_order").eq("athlete_user_id", user.id).eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
      supabase.from("workout_sessions").select("id, workout_id, workout_name_snapshot, started_at").eq("athlete_user_id", user.id).eq("status", "in_progress").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (templates.error) setMessage(templates.error.message);
    else if (active.error) setMessage(active.error.message);
    setWorkouts((templates.data ?? []) as Workout[]);
    setActiveWorkout((active.data ?? null) as ActiveWorkout | null);
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

  if (loading) return <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12"><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Train</p><h1 className="mt-2 text-3xl font-black">Loading your training...</h1><div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-900"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#ff0032]" /></div></main>;

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-7 px-4 py-7 sm:px-6 sm:py-10">
    <header><div className="flex items-center gap-3 text-[#ff0032]"><DumbbellIcon/><p className="text-xs font-black uppercase tracking-[.22em]">PHATBOT Train</p></div><h1 className="mt-3 text-3xl font-black">What are we training?</h1><p className="mt-2 max-w-lg text-zinc-400">Choose your training day. PHATBOT will pull your history, targets, and progressive overload context into the workout.</p></header>

    {message && <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-200">{message}</p>}

    {activeWorkout && <section className="overflow-hidden rounded-2xl border border-[#ff0032]/60 bg-[#ff0032]/5"><div className="p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff0032]">Workout In Progress</p><h2 className="mt-2 text-2xl font-black">{activeWorkout.workout_name_snapshot}</h2><p className="mt-2 text-sm text-zinc-300">Your workout is saved and waiting. Continue where you left off before starting another training day.</p><Link href={`/sessions/${activeWorkout.id}`} className="mt-5 flex min-h-14 items-center justify-center rounded-xl bg-[#ff0032] px-5 text-base font-black text-white">Resume PHATBOT Train →</Link></div></section>}

    {!activeWorkout && workouts.length > 0 && <section><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Ready To Train</p><h2 className="mt-1 text-xl font-black">Choose a workout</h2></div><span className="text-xs font-semibold text-zinc-500">{workouts.length} available</span></div><div className="grid gap-3">{workouts.map((workout, index) => { const description = athleteFacingDescription(workout.description); return <article key={workout.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5"><Link href={`/workouts/${workout.id}`} className="block"><div className="flex items-start gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-sm font-black text-zinc-300">{String(index + 1).padStart(2, "0")}</div><div className="min-w-0 flex-1"><h3 className="text-xl font-black">{workout.name}</h3>{description && <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-400">{description}</p>}<p className="mt-4 text-sm font-black text-white">Open workout <span className="text-[#ff0032]">→</span></p></div></div></Link><button disabled={workingId!==null} onClick={() => setArchiveTarget(workout)} className="mt-4 border-t border-zinc-900 pt-3 text-xs font-semibold text-zinc-600 hover:text-zinc-300 disabled:opacity-40">Manage workout</button></article>; })}</div></section>}

    {!activeWorkout && workouts.length === 0 && <section className="rounded-2xl border border-zinc-800 p-7 text-center"><div className="mx-auto flex w-fit text-[#ff0032]"><DumbbellIcon/></div><h2 className="mt-3 text-2xl font-black">Your training area is ready.</h2><p className="mx-auto mt-3 max-w-md text-zinc-400">Add your first workout template and PHATBOT can start building your performance history.</p><Link href="/workouts/new" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#ff0032] px-6 font-black text-white">Create First Workout</Link></section>}

    {!activeWorkout && workouts.length > 0 && <Link href="/workouts/new" className="rounded-xl border border-zinc-800 px-5 py-3 text-center text-sm font-bold text-zinc-400">+ Add another workout</Link>}

    {archiveTarget && <section className="rounded-2xl border border-zinc-600 bg-black p-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Manage Workout</p><h2 className="mt-2 text-xl font-black">Retire {archiveTarget.name}?</h2><p className="mt-2 text-sm leading-6 text-zinc-300">This removes the template from your training choices. Completed sessions, reports, scores, PRs, and trend history stay safe.</p><div className="mt-4 grid grid-cols-2 gap-2"><button disabled={workingId!==null} onClick={() => setArchiveTarget(null)} className="rounded-xl border border-zinc-700 px-4 py-3 font-semibold disabled:opacity-50">Keep It</button><button disabled={workingId!==null} onClick={() => archiveWorkout(archiveTarget)} className="rounded-xl bg-white px-4 py-3 font-black text-black disabled:opacity-50">{workingId===archiveTarget.id?"Archiving...":"Archive"}</button></div></section>}
  </main>;
}