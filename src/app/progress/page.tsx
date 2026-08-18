"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { scoreExercisePerformance, type PerformanceSet } from "@/features/scoring/progressiveOverload";

type RawSet = { weight: number; reps: number; partial_reps: number; set_type: string; set_number: number };
type ExerciseSession = { exercise_id: string; position: number; notes: string | null; sets: RawSet[] };
type WorkoutSession = { id: string; workout_id: string; workout_name_snapshot: string; completed_at: string };
type ScoredWorkout = { id: string; completedAt: string; score: number | null };
type WeekPoint = { key: string; label: string; start: Date; end: Date; score: number | null; completed: number; comparable: number };

function normalize(sets: RawSet[]): PerformanceSet[] {
  return [...sets]
    .sort((a, b) => a.set_number - b.set_number)
    .filter((set) => ["warmup", "working", "top", "backoff"].includes(set.set_type))
    .map((set) => ({ weight: Number(set.weight), reps: set.reps, partialReps: set.partial_reps, setType: set.set_type as PerformanceSet["setType"] }));
}

function mondayOf(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? 6 : day - 1;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function weekKey(date: Date) {
  return mondayOf(date).toISOString().slice(0, 10);
}

export default function ProgressPage() {
  const [workouts, setWorkouts] = useState<ScoredWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 70);
      cutoff.setHours(0, 0, 0, 0);

      const { data: sessions, error } = await supabase
        .from("workout_sessions")
        .select("id, workout_id, workout_name_snapshot, completed_at")
        .eq("athlete_user_id", user.id)
        .eq("status", "completed")
        .gte("completed_at", cutoff.toISOString())
        .order("completed_at", { ascending: true });

      if (error) { setMessage(error.message); setLoading(false); return; }

      const results: ScoredWorkout[] = [];
      for (const session of (sessions ?? []) as WorkoutSession[]) {
        const { data: currentData } = await supabase.from("exercise_sessions").select("exercise_id, position, notes, sets(weight,reps,partial_reps,set_type,set_number)").eq("workout_session_id", session.id).order("position");
        const current = (currentData ?? []) as ExerciseSession[];

        const { data: previousSession } = await supabase.from("workout_sessions").select("id").eq("athlete_user_id", user.id).eq("workout_id", session.workout_id).eq("status", "completed").lt("completed_at", session.completed_at).order("completed_at", { ascending: false }).limit(1).maybeSingle();
        if (!previousSession) { results.push({ id: session.id, completedAt: session.completed_at, score: null }); continue; }

        const { data: previousData } = await supabase.from("exercise_sessions").select("exercise_id, position, notes, sets(weight,reps,partial_reps,set_type,set_number)").eq("workout_session_id", previousSession.id);
        const previous = (previousData ?? []) as ExerciseSession[];

        const first = [...current].sort((a, b) => a.position - b.position)[0];
        const previousFirst = first ? previous.find((item) => item.exercise_id === first.exercise_id) : null;
        const firstSets = first ? normalize(first.sets).filter((set) => set.setType !== "warmup").slice(0, 3) : [];
        const previousSets = previousFirst ? normalize(previousFirst.sets).filter((set) => set.setType !== "warmup").slice(0, 3) : [];
        const topScores = firstSets.map((set, index) => scoreExercisePerformance({ sets: [set] }, previousSets[index] ? { sets: [previousSets[index]] } : null)).filter((result) => result.result !== "baseline");
        const topAverage = topScores.length ? topScores.reduce((sum, result) => sum + result.score, 0) / topScores.length : null;

        const restScores = current.filter((item) => item.position > 1).map((item) => {
          const prior = previous.find((candidate) => candidate.exercise_id === item.exercise_id);
          return scoreExercisePerformance({ sets: normalize(item.sets), notes: item.notes }, prior ? { sets: normalize(prior.sets), notes: prior.notes } : null);
        }).filter((result) => result.result !== "baseline");
        const restAverage = restScores.length ? restScores.reduce((sum, result) => sum + result.score, 0) / restScores.length : null;
        const score = topAverage === null ? restAverage : restAverage === null ? topAverage : topAverage * 0.6 + restAverage * 0.4;
        results.push({ id: session.id, completedAt: session.completed_at, score: score === null ? null : Math.round(score * 100) });
      }

      setWorkouts(results);
      setLoading(false);
    }
    load();
  }, []);

  const weeks = useMemo<WeekPoint[]>(() => {
    const currentMonday = mondayOf(new Date());
    return Array.from({ length: 8 }, (_, index) => {
      const start = new Date(currentMonday);
      start.setDate(start.getDate() - (7 * (7 - index)));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      const inWeek = workouts.filter((workout) => weekKey(new Date(workout.completedAt)) === weekKey(start));
      const comparable = inWeek.filter((workout) => workout.score !== null);
      const score = comparable.length ? Math.round(comparable.reduce((sum, workout) => sum + (workout.score ?? 0), 0) / comparable.length) : null;
      return { key: weekKey(start), label: `${start.getMonth() + 1}/${start.getDate()}`, start, end, score, completed: inWeek.length, comparable: comparable.length };
    });
  }, [workouts]);

  const scoredWeeks = weeks.filter((week) => week.score !== null);
  const latest = [...scoredWeeks].pop() ?? null;
  const prior = scoredWeeks.length > 1 ? scoredWeeks[scoredWeeks.length - 2] : null;
  const change = latest && prior ? latest.score! - prior.score! : null;

  if (loading) return <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-zinc-300">Building your progress trend...</main>;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT Progress</p>
        <h1 className="mt-2 text-3xl font-bold">Weekly performance trend</h1>
        <p className="mt-2 text-zinc-400">See whether your progressive-overload scores are moving in the right direction over time.</p>
      </header>

      {message && <p className="rounded-xl border border-zinc-800 p-4 text-sm">{message}</p>}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 p-5"><p className="text-sm text-zinc-500">Latest scored week</p><p className="mt-2 text-3xl font-bold">{latest?.score === null || !latest ? "N/A" : `${latest.score}%`}</p></div>
        <div className="rounded-xl border border-zinc-800 p-5"><p className="text-sm text-zinc-500">Week-over-week</p><p className="mt-2 text-3xl font-bold">{change === null ? "N/A" : `${change > 0 ? "+" : ""}${change} pts`}</p></div>
        <div className="rounded-xl border border-zinc-800 p-5"><p className="text-sm text-zinc-500">8-week workouts</p><p className="mt-2 text-3xl font-bold">{workouts.length}</p></div>
      </section>

      <section className="rounded-2xl border border-zinc-800 p-5">
        <div className="flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold">8-week score trend</h2><p className="mt-1 text-sm text-zinc-500">Weekly average of comparable workout scores.</p></div><span className="text-xs text-zinc-600">0–100%</span></div>
        <div className="mt-8 flex h-64 items-end gap-2 sm:gap-4">
          {weeks.map((week) => {
            const height = week.score === null ? 4 : Math.max(8, week.score);
            return <div key={week.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-xs font-semibold text-zinc-300">{week.score === null ? "—" : `${week.score}`}</span><div className="flex h-48 w-full items-end rounded-lg bg-zinc-900 p-1"><div className="w-full rounded-md bg-white" style={{ height: `${height}%`, opacity: week.score === null ? 0.15 : 1 }} /></div><span className="text-[11px] text-zinc-500">{week.label}</span></div>;
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {weeks.slice().reverse().map((week) => <article key={week.key} className="rounded-xl border border-zinc-800 p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold">Week of {week.start.toLocaleDateString()}</p><p className="mt-1 text-xs text-zinc-500">{week.completed} completed · {week.comparable} comparable</p></div><p className="text-2xl font-bold">{week.score === null ? "—" : `${week.score}%`}</p></div></article>)}
      </section>

      <div className="grid gap-3 sm:grid-cols-2"><Link href="/weekly" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">Current Week</Link><Link href="/" className="rounded-lg bg-white px-5 py-3 text-center font-semibold text-black">Back to Dashboard</Link></div>
    </main>
  );
}
