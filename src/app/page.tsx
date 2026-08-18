"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { calculateStrengthChange } from "@/features/scoring/strengthChange";
import { scoreExercisePerformance, type PerformanceSet } from "@/features/scoring/progressiveOverload";

type Profile = { display_name: string | null };
type WorkoutSession = { id: string; workout_id: string; workout_name_snapshot: string; completed_at: string };
type RawSet = { weight: number; reps: number; partial_reps: number; set_type: string; set_number: number };
type ExerciseSession = { exercise_id: string; position: number; notes: string | null; sets: RawSet[] };

function normalize(sets: RawSet[]): PerformanceSet[] {
  return [...sets]
    .sort((a, b) => a.set_number - b.set_number)
    .filter((set) => ["warmup", "working", "top", "backoff"].includes(set.set_type))
    .map((set) => ({ weight: Number(set.weight), reps: set.reps, partialReps: set.partial_reps, setType: set.set_type as PerformanceSet["setType"] }));
}

function startOfWeek() {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [latestWorkout, setLatestWorkout] = useState<WorkoutSession | null>(null);
  const [weeklyCompleted, setWeeklyCompleted] = useState(0);
  const [latestStrength, setLatestStrength] = useState<number | null>(null);
  const [weeklyScore, setWeeklyScore] = useState<number | null>(null);
  const [weeklyStrength, setWeeklyStrength] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    async function scoreWorkout(userId: string, session: WorkoutSession) {
      const { data: currentData } = await supabase.from("exercise_sessions").select("exercise_id, position, notes, sets(weight,reps,partial_reps,set_type,set_number)").eq("workout_session_id", session.id).order("position");
      const current = (currentData ?? []) as ExerciseSession[];
      const { data: previousSession } = await supabase.from("workout_sessions").select("id").eq("athlete_user_id", userId).eq("workout_id", session.workout_id).eq("status", "completed").lt("completed_at", session.completed_at).order("completed_at", { ascending: false }).limit(1).maybeSingle();
      if (!previousSession) return { score: null as number | null, strength: null as number | null };

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

      const strength = calculateStrengthChange(
        current.map((exercise) => ({ exerciseId: exercise.exercise_id, sets: exercise.sets.map((set) => ({ weight: Number(set.weight), reps: set.reps, setType: set.set_type })) })),
        previous.map((exercise) => ({ exerciseId: exercise.exercise_id, sets: exercise.sets.map((set) => ({ weight: Number(set.weight), reps: set.reps, setType: set.set_type })) })),
      ).percentageChange;

      return { score: score === null ? null : Math.round(score * 100), strength };
    }

    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setSignedIn(false); setLoading(false); return; }
      setSignedIn(true);

      const weekStart = startOfWeek();
      const [profileResult, latestResult, weeklySessionsResult] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).single(),
        supabase.from("workout_sessions").select("id, workout_id, workout_name_snapshot, completed_at").eq("athlete_user_id", user.id).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("workout_sessions").select("id, workout_id, workout_name_snapshot, completed_at").eq("athlete_user_id", user.id).eq("status", "completed").gte("completed_at", weekStart.toISOString()).order("completed_at", { ascending: true }),
      ]);

      const latest = latestResult.data as WorkoutSession | null;
      const weeklySessions = (weeklySessionsResult.data ?? []) as WorkoutSession[];
      const weeklyResults = [] as { score: number | null; strength: number | null }[];
      for (const session of weeklySessions) weeklyResults.push(await scoreWorkout(user.id, session));

      let strength: number | null = null;
      if (latest) strength = (await scoreWorkout(user.id, latest)).strength;

      const scored = weeklyResults.filter((result) => result.score !== null);
      const strengthScored = weeklyResults.filter((result) => result.strength !== null);
      const weekScore = scored.length ? Math.round(scored.reduce((sum, result) => sum + (result.score ?? 0), 0) / scored.length) : null;
      const weekStrength = strengthScored.length ? strengthScored.reduce((sum, result) => sum + (result.strength ?? 0), 0) / strengthScored.length : null;

      if (active) {
        setProfile(profileResult.data);
        setLatestWorkout(latest);
        setWeeklyCompleted(weeklySessions.length);
        setLatestStrength(strength);
        setWeeklyScore(weekScore);
        setWeeklyStrength(weekStrength);
        setLoading(false);
      }
    }

    loadUser();
    const { data: listener } = supabase.auth.onAuthStateChange(() => { loadUser(); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function signOut() { const supabase = createSupabaseBrowserClient(); await supabase.auth.signOut(); window.location.href = "/"; }

  if (loading) return <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12"><p className="text-zinc-300">Loading PHATBOT...</p></main>;
  if (!signedIn) return <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12"><div><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p><h1 className="mt-2 text-4xl font-bold">Did you improve today?</h1><p className="mt-4 text-zinc-300">PHATBOT tracks progressive overload, workout scoring, personal records, and your performance over time.</p></div><Link href="/auth" className="rounded-lg bg-white px-5 py-3 text-center font-semibold text-black">Create Account / Sign In</Link></main>;

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-10">
    <header className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p><h1 className="mt-2 text-3xl font-bold">Welcome{profile?.display_name ? `, ${profile.display_name}` : ""}.</h1><p className="mt-2 text-zinc-300">Your training dashboard is ready.</p></div><div className="flex gap-2"><Link href="/account" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Account</Link><button onClick={signOut} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Sign Out</button></div></header>
    <section className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-zinc-800 p-5"><p className="text-sm text-zinc-400">Latest Workout</p>{latestWorkout ? <><p className="mt-2 text-2xl font-semibold">{latestWorkout.workout_name_snapshot}</p><p className="mt-2 text-sm text-zinc-400">Completed {new Date(latestWorkout.completed_at).toLocaleString()}</p><div className="mt-4 rounded-lg bg-zinc-900 p-3"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Strength vs Prior</p><p className="mt-1 text-2xl font-bold">{latestStrength === null ? "N/A" : `${latestStrength >= 0 ? "+" : ""}${latestStrength.toFixed(1)}%`}</p></div><Link href={`/sessions/${latestWorkout.id}/report`} className="mt-4 inline-block text-sm font-semibold underline">View Report →</Link></> : <><p className="mt-2 text-2xl font-semibold">No workouts yet</p><p className="mt-2 text-sm text-zinc-400">Your first completed workout will appear here.</p></>}</div>
      <div className="rounded-xl border border-zinc-800 p-5"><p className="text-sm text-zinc-400">This Week</p><div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-lg bg-zinc-900 p-3"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Performance</p><p className="mt-1 text-3xl font-bold">{weeklyScore === null ? "Baseline" : `${weeklyScore}%`}</p></div><div className="rounded-lg bg-zinc-900 p-3"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Strength</p><p className="mt-1 text-3xl font-bold">{weeklyStrength === null ? "N/A" : `${weeklyStrength >= 0 ? "+" : ""}${weeklyStrength.toFixed(1)}%`}</p></div></div><p className="mt-3 text-sm text-zinc-400">{weeklyCompleted} workout{weeklyCompleted === 1 ? "" : "s"} completed this week.</p><div className="mt-4 flex flex-wrap gap-4"><Link href="/weekly" className="text-sm font-semibold underline">View Weekly Report →</Link><Link href="/progress" className="text-sm font-semibold underline">View Progress Trend →</Link></div></div>
    </section>
    <Link href="/workouts" className="rounded-lg bg-white px-5 py-3 text-center font-semibold text-black">Start Workout</Link>
  </main>;
}
