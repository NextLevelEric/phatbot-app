"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  assignmentSourceLabel,
  buildNextProgramWorkout,
  friendlyProgramError,
  reviewDateStatus,
  type NextProgramWorkout,
  type NextProgramWorkoutRow,
  type ProgramAssignment,
} from "@/features/programs/programUi";

type ActiveWorkout = { id: string; workout_name_snapshot: string };

export default function AthleteProgramHomeCard({
  userId,
  activeWorkout,
}: {
  userId: string;
  activeWorkout: ActiveWorkout | null;
}) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<ProgramAssignment | null>(null);
  const [nextWorkout, setNextWorkout] = useState<NextProgramWorkout | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const [assignmentResult, nextResult] = await Promise.all([
        supabase.rpc("get_athlete_program_assignments", { p_athlete_user_id: userId }),
        supabase.rpc("get_next_program_workout", { p_athlete_user_id: userId }),
      ]);
      if (!mounted) return;
      if (assignmentResult.error || nextResult.error) {
        setLoadFailed(true);
      } else {
        const history = (assignmentResult.data ?? []) as ProgramAssignment[];
        setAssignment(history.find((item) => item.assignment_status === "active") ?? null);
        setNextWorkout(buildNextProgramWorkout((nextResult.data ?? []) as NextProgramWorkoutRow[]));
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [userId]);

  async function startNextWorkout() {
    if (starting) return;
    setStarting(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("start_my_next_program_workout");
    if (!error && typeof data === "string") {
      window.location.href = `/sessions/${data}`;
      return;
    }

    // A second device or rapid retry may have won the start race. Resume the
    // authoritative active session rather than attempting another mutation.
    const { data: active } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("athlete_user_id", userId)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active?.id) {
      window.location.href = `/sessions/${active.id}`;
      return;
    }
    setMessage(friendlyProgramError("start"));
    setStarting(false);
  }

  if (loading) {
    return <section aria-label="Loading your program" className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5"><div className="h-3 w-28 animate-pulse rounded bg-[#ff0032]/50"/><div className="mt-4 h-8 w-2/3 animate-pulse rounded bg-zinc-800"/><div className="mt-5 h-14 animate-pulse rounded-2xl bg-zinc-900"/></section>;
  }

  if (loadFailed) {
    return <section className="rounded-3xl border border-amber-700/50 bg-amber-950/10 p-5"><p className="text-xs font-black uppercase tracking-[.2em] text-amber-400">Program unavailable</p><p className="mt-2 text-sm text-zinc-300">{friendlyProgramError("load")}</p><Link href="/workouts" className="mt-4 inline-flex rounded-xl border border-zinc-700 px-4 py-3 text-sm font-black">Use my workouts</Link></section>;
  }

  if (!assignment) {
    return <section className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-black p-5 shadow-xl sm:p-6"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Choose your program</p><h2 className="mt-2 text-2xl font-black">What are you training next?</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Pick a PHATBOT program or keep training with your own workouts. A program is optional.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><Link href="/programs" className="rounded-2xl bg-[#ff0032] px-5 py-4 text-center font-black text-white">Browse Programs</Link><Link href="/workouts" className="rounded-2xl border border-zinc-700 px-5 py-4 text-center font-black">Create / Use My Own Workouts</Link></div></section>;
  }

  const review = reviewDateStatus(assignment.review_due_at);
  const hasReadyWorkout = Boolean(nextWorkout && nextWorkout.exercises.length > 0);
  return <section className="overflow-hidden rounded-3xl border border-[rgba(255,0,50,.42)] bg-gradient-to-b from-zinc-900 to-black p-5 shadow-2xl sm:p-7">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Your program</p><h2 className="mt-2 text-xl font-black">{assignment.program_family_name}</h2><p className="mt-1 text-xs text-zinc-500">v{assignment.version_number} · {assignmentSourceLabel(assignment)}</p></div><Link href="/programs/current" className="shrink-0 text-sm font-black text-zinc-300">Details →</Link></div>
    {hasReadyWorkout && nextWorkout ? <div className="mt-5 rounded-2xl border border-zinc-800 bg-black/50 p-4"><p className="text-[11px] font-black uppercase tracking-[.18em] text-zinc-500">Next workout</p><p className="mt-2 text-2xl font-black">{nextWorkout.dayName}</p><p className="mt-1 text-sm text-zinc-400">{nextWorkout.exercises.length} exercise{nextWorkout.exercises.length === 1 ? "" : "s"}</p></div> : <div className="mt-5 rounded-2xl border border-amber-800/50 p-4"><p className="font-black text-amber-300">Next workout unavailable</p><p className="mt-1 text-sm text-zinc-400">Your assignment is safe. Try again before starting.</p></div>}
    <p className={`mt-3 text-xs font-bold ${review.isDue ? "text-amber-300" : "text-zinc-500"}`}>{review.label}</p>
    {activeWorkout ? <p className="mt-4 rounded-xl border border-zinc-800 px-4 py-3 text-sm text-zinc-400">Your next program workout will wait while <span className="font-bold text-zinc-200">{activeWorkout.workout_name_snapshot}</span> is in progress.</p> : <button type="button" onClick={() => void startNextWorkout()} disabled={!hasReadyWorkout || starting} className="mt-5 w-full rounded-2xl bg-[#ff0032] px-5 py-4 font-black text-white disabled:opacity-50">{starting ? "Starting workout..." : "Start Next Workout"}</button>}
    {message && <p role="alert" className="mt-3 text-sm text-amber-300">{message}</p>}
    <div className="mt-4 flex items-center justify-between gap-4 text-sm"><Link href="/programs/current" className="font-black text-zinc-300">View rotation</Link><Link href="/workouts" className="font-bold text-zinc-500">Other workouts</Link></div>
  </section>;
}
