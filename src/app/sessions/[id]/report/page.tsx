"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { explainExerciseScore, scoreExercisePerformance, type ExerciseScoreResult, type PerformanceSet } from "@/features/scoring/progressiveOverload";
import { calculateWorkoutScore } from "@/features/scoring/workoutScore";

type RawSet = { weight: number; reps: number; partial_reps: number; set_type: string };
type ExerciseSession = { exercise_id: string; exercise_name_snapshot: string; position: number; notes: string | null; sets: RawSet[] };
type Session = { id: string; workout_id: string; workout_name_snapshot: string; completed_at: string | null };
type ReportRow = { name: string; position: number; result: ExerciseScoreResult };

function normalizeSets(sets: RawSet[]): PerformanceSet[] {
  return sets.filter((set) => ["warmup", "working", "top", "backoff"].includes(set.set_type)).map((set) => ({ weight: Number(set.weight), reps: set.reps, partialReps: set.partial_reps, setType: set.set_type as PerformanceSet["setType"] }));
}

export default function WorkoutReportPage() {
  const params = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadReport = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/auth"; return; }

    const { data: currentSession, error: currentError } = await supabase.from("workout_sessions").select("id, workout_id, workout_name_snapshot, completed_at").eq("id", params.id).eq("athlete_user_id", user.id).eq("status", "completed").single();
    if (currentError || !currentSession) { setMessage(currentError?.message ?? "Completed workout not found."); setLoading(false); return; }

    const { data: currentExercises, error: exerciseError } = await supabase.from("exercise_sessions").select("exercise_id, exercise_name_snapshot, position, notes, sets(weight, reps, partial_reps, set_type)").eq("workout_session_id", params.id).order("position", { ascending: true });
    if (exerciseError) { setMessage(exerciseError.message); setLoading(false); return; }

    const { data: previousSession } = await supabase.from("workout_sessions").select("id").eq("athlete_user_id", user.id).eq("workout_id", currentSession.workout_id).eq("status", "completed").lt("completed_at", currentSession.completed_at).order("completed_at", { ascending: false }).limit(1).maybeSingle();

    let previousExercises: ExerciseSession[] = [];
    if (previousSession) {
      const { data } = await supabase.from("exercise_sessions").select("exercise_id, exercise_name_snapshot, position, notes, sets(weight, reps, partial_reps, set_type)").eq("workout_session_id", previousSession.id);
      previousExercises = (data ?? []) as ExerciseSession[];
    }

    const reportRows = ((currentExercises ?? []) as ExerciseSession[]).map((exercise) => {
      const previous = previousExercises.find((candidate) => candidate.exercise_id === exercise.exercise_id) ?? null;
      return { name: exercise.exercise_name_snapshot, position: exercise.position, result: scoreExercisePerformance({ sets: normalizeSets(exercise.sets ?? []), notes: exercise.notes }, previous ? { sets: normalizeSets(previous.sets ?? []), notes: previous.notes } : null) };
    });

    setSession(currentSession); setRows(reportRows); setLoading(false);
  }, [params.id]);

  useEffect(() => { loadReport(); }, [loadReport]);

  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Building your PHATBOT report...</main>;
  if (!session) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p>{message}</p><Link href="/" className="mt-6 inline-block underline">Dashboard</Link></main>;

  const workoutScore = calculateWorkoutScore(rows);
  const score = workoutScore.percentage;
  const progressed = rows.filter((row) => row.result.result === "progression").length;
  const neutral = rows.filter((row) => row.result.result === "neutral" || row.result.result === "baseline").length;
  const regressed = rows.filter((row) => row.result.result === "regression").length;

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">Workout Report</p><h1 className="mt-2 text-3xl font-bold">{session.workout_name_snapshot}</h1><p className="mt-2 text-zinc-400">Did you improve today?</p></header>
    <section className="rounded-2xl border border-zinc-800 p-6 text-center"><p className="text-sm uppercase tracking-widest text-zinc-500">Progressive Overload Score</p><p className="mt-2 text-6xl font-black">{score === null ? "BASELINE" : `${score}%`}</p><p className="mt-3 text-sm text-zinc-400">{score === null ? "This is your first comparable workout. Your next completion creates the first true score." : `${progressed} progressed · ${neutral} neutral · ${regressed} regressed`}</p>{score !== null && <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-zinc-900 p-4"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Top Block · 60%</p><p className="mt-1 text-2xl font-bold">{workoutScore.topBlockPercentage}%</p><p className="mt-1 text-xs text-zinc-500">First {workoutScore.topBlockCount} comparable exercise{workoutScore.topBlockCount === 1 ? "" : "s"}</p></div><div className="rounded-xl bg-zinc-900 p-4"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Accessories · {workoutScore.accessoryCount ? "40%" : "—"}</p><p className="mt-1 text-2xl font-bold">{workoutScore.accessoryPercentage === null ? "N/A" : `${workoutScore.accessoryPercentage}%`}</p><p className="mt-1 text-xs text-zinc-500">{workoutScore.accessoryCount ? `${workoutScore.accessoryCount} later comparable exercise${workoutScore.accessoryCount === 1 ? "" : "s"}` : "No separate accessory block in this workout"}</p></div></div>}</section>
    <section className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400"><strong className="text-zinc-200">How this score works:</strong> the first four comparable exercises make up 60% of the workout score. Later accessory and back-off exercises make up 40%. If the workout has four or fewer comparable exercises, the available work represents the full score.</section>
    <section className="flex flex-col gap-3">{rows.map((row) => <article key={`${row.position}-${row.name}`} className="rounded-xl border border-zinc-800 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-zinc-500">Exercise {row.position}{row.position <= 4 ? " · Top Block" : " · Accessory"}</p><h2 className="mt-1 text-lg font-semibold">{row.name}</h2></div><span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold uppercase">{row.result.result}</span></div><p className="mt-3 text-sm text-zinc-300">{explainExerciseScore(row.result.explanationCode)}</p>{row.result.currentBest && <p className="mt-2 text-xs text-zinc-500">Current best: {row.result.currentBest.weight} × {row.result.currentBest.reps}{row.result.currentBest.partialReps ? ` + ${row.result.currentBest.partialReps} partial` : ""}{row.result.previousBest ? ` · Previous: ${row.result.previousBest.weight} × ${row.result.previousBest.reps}${row.result.previousBest.partialReps ? ` + ${row.result.previousBest.partialReps} partial` : ""}` : ""}</p>}</article>)}</section>
    <Link href="/" className="rounded-lg bg-white px-5 py-3 text-center font-semibold text-black">Back to Dashboard</Link>
  </main>;
}
