"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { scoreExercisePerformance, type PerformanceSet } from "@/features/scoring/progressiveOverload";

type RawSet = { weight: number; reps: number; partial_reps: number; set_type: string; set_number: number };
type ExerciseSession = { exercise_id: string; position: number; notes: string | null; sets: RawSet[] };
type WorkoutSession = { id: string; workout_id: string; workout_name_snapshot: string; completed_at: string };
type WeeklyWorkout = { id: string; name: string; completedAt: string; score: number | null };

function normalize(sets: RawSet[]): PerformanceSet[] {
  return [...sets].sort((a,b) => a.set_number-b.set_number).filter((set) => ["warmup","working","top","backoff"].includes(set.set_type)).map((set) => ({ weight: Number(set.weight), reps: set.reps, partialReps: set.partial_reps, setType: set.set_type as PerformanceSet["setType"] }));
}

function startOfWeek() {
  const date = new Date(); const day = date.getDay(); const diff = day === 0 ? 6 : day - 1; date.setDate(date.getDate() - diff); date.setHours(0,0,0,0); return date;
}

export default function WeeklyPage() {
  const [workouts, setWorkouts] = useState<WeeklyWorkout[]>([]); const [loading, setLoading] = useState(true); const [message, setMessage] = useState("");
  useEffect(() => { const supabase = createSupabaseBrowserClient(); async function load() {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { window.location.href = "/auth"; return; }
    const weekStart = startOfWeek();
    const { data: sessions, error } = await supabase.from("workout_sessions").select("id, workout_id, workout_name_snapshot, completed_at").eq("athlete_user_id", user.id).eq("status", "completed").gte("completed_at", weekStart.toISOString()).order("completed_at", { ascending: true });
    if (error) { setMessage(error.message); setLoading(false); return; }
    const results: WeeklyWorkout[] = [];
    for (const session of (sessions ?? []) as WorkoutSession[]) {
      const { data: currentData } = await supabase.from("exercise_sessions").select("exercise_id, position, notes, sets(weight,reps,partial_reps,set_type,set_number)").eq("workout_session_id", session.id).order("position");
      const current = (currentData ?? []) as ExerciseSession[];
      const { data: previousSession } = await supabase.from("workout_sessions").select("id").eq("athlete_user_id", user.id).eq("workout_id", session.workout_id).eq("status", "completed").lt("completed_at", session.completed_at).order("completed_at", { ascending: false }).limit(1).maybeSingle();
      if (!previousSession) { results.push({ id: session.id, name: session.workout_name_snapshot, completedAt: session.completed_at, score: null }); continue; }
      const { data: previousData } = await supabase.from("exercise_sessions").select("exercise_id, position, notes, sets(weight,reps,partial_reps,set_type,set_number)").eq("workout_session_id", previousSession.id);
      const previous = (previousData ?? []) as ExerciseSession[];
      const first = [...current].sort((a,b) => a.position-b.position)[0]; const previousFirst = first ? previous.find((item) => item.exercise_id === first.exercise_id) : null;
      const firstSets = first ? normalize(first.sets).filter((set) => set.setType !== "warmup").slice(0,3) : []; const previousSets = previousFirst ? normalize(previousFirst.sets).filter((set) => set.setType !== "warmup").slice(0,3) : [];
      const topScores = firstSets.map((set,index) => scoreExercisePerformance({ sets:[set] }, previousSets[index] ? { sets:[previousSets[index]] } : null)).filter((result) => result.result !== "baseline");
      const topAverage = topScores.length ? topScores.reduce((sum,result) => sum + result.score,0) / topScores.length : null;
      const accessoryScores = current.filter((item) => item.position > 1).map((item) => { const prior = previous.find((candidate) => candidate.exercise_id === item.exercise_id); return scoreExercisePerformance({ sets:normalize(item.sets), notes:item.notes }, prior ? { sets:normalize(prior.sets), notes:prior.notes } : null); }).filter((result) => result.result !== "baseline");
      const accessoryAverage = accessoryScores.length ? accessoryScores.reduce((sum,result) => sum + result.score,0) / accessoryScores.length : null;
      const score = topAverage === null ? accessoryAverage : accessoryAverage === null ? topAverage : topAverage*0.6 + accessoryAverage*0.4;
      results.push({ id:session.id, name:session.workout_name_snapshot, completedAt:session.completed_at, score:score === null ? null : Math.round(score*100) });
    }
    setWorkouts(results); setLoading(false);
  } load(); }, []);
  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Calculating this week...</main>;
  const scored = workouts.filter((workout) => workout.score !== null); const weeklyAverage = scored.length ? Math.round(scored.reduce((sum,workout) => sum + (workout.score ?? 0),0)/scored.length) : null;
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10"><header><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT Weekly</p><h1 className="mt-2 text-3xl font-bold">Your week in training</h1><p className="mt-2 text-zinc-400">Workout scores roll up into one simple weekly performance score.</p></header>{message && <p className="rounded-xl border border-zinc-800 p-4 text-sm">{message}</p>}<section className="rounded-2xl border border-zinc-800 p-6 text-center"><p className="text-sm uppercase tracking-widest text-zinc-500">Weekly Performance Score</p><p className="mt-2 text-6xl font-black">{weeklyAverage === null ? "BASELINE" : `${weeklyAverage}%`}</p><p className="mt-3 text-sm text-zinc-400">{scored.length} comparable workout{scored.length === 1 ? "" : "s"} · {workouts.length} completed this week</p></section><section className="flex flex-col gap-3">{workouts.length === 0 ? <div className="rounded-xl border border-zinc-800 p-5 text-zinc-400">No completed workouts yet this week.</div> : workouts.map((workout) => <Link key={workout.id} href={`/sessions/${workout.id}/report`} className="rounded-xl border border-zinc-800 p-5"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold">{workout.name}</p><p className="mt-1 text-xs text-zinc-500">{new Date(workout.completedAt).toLocaleDateString()}</p></div><p className="text-2xl font-bold">{workout.score === null ? "Baseline" : `${workout.score}%`}</p></div></Link>)}</section><Link href="/" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">Back to Dashboard</Link></main>;
}
