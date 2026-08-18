"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { explainExerciseScore, scoreExercisePerformance, type ExerciseScoreResult, type PerformanceSet } from "@/features/scoring/progressiveOverload";
import { detectPersonalRecords, type PersonalRecordResult, type PRSet } from "@/features/scoring/personalRecords";
import { calculateStrengthChange, type StrengthChangeResult } from "@/features/scoring/strengthChange";

type RawSet = { weight: number; reps: number; partial_reps: number; set_type: string; set_number?: number };
type ExerciseSession = { exercise_id: string; exercise_name_snapshot: string; position: number; notes: string | null; sets: RawSet[] };
type Session = { id: string; workout_id: string; workout_name_snapshot: string; completed_at: string | null };
type ReportRow = { name: string; position: number; result: ExerciseScoreResult; prs: PersonalRecordResult[] };

function normalizeSets(sets: RawSet[]): PerformanceSet[] { return sets.filter((set) => ["warmup", "working", "top", "backoff"].includes(set.set_type)).map((set) => ({ weight: Number(set.weight), reps: set.reps, partialReps: set.partial_reps, setType: set.set_type as PerformanceSet["setType"] })); }
function prSets(sets: RawSet[]): PRSet[] { return sets.map((set) => ({ weight: Number(set.weight), reps: set.reps, partialReps: set.partial_reps, setType: set.set_type })); }
function scoreSingleSet(current: PerformanceSet, previous: PerformanceSet | null) { return scoreExercisePerformance({ sets: [current] }, previous ? { sets: [previous] } : null); }
function strengthSets(sets: RawSet[]) { return sets.map((set) => ({ weight: Number(set.weight), reps: set.reps, setType: set.set_type })); }

export default function WorkoutReportPage() {
  const params = useParams<{ id: string }>(); const [session, setSession] = useState<Session | null>(null); const [rows, setRows] = useState<ReportRow[]>([]); const [topSetScores, setTopSetScores] = useState<ExerciseScoreResult[]>([]); const [strengthChange, setStrengthChange] = useState<StrengthChangeResult | null>(null); const [loading, setLoading] = useState(true); const [message, setMessage] = useState("");

  const loadReport = useCallback(async () => {
    const supabase = createSupabaseBrowserClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) { window.location.href = "/auth"; return; }
    const { data: currentSession, error: currentError } = await supabase.from("workout_sessions").select("id, workout_id, workout_name_snapshot, completed_at").eq("id", params.id).eq("athlete_user_id", user.id).eq("status", "completed").single();
    if (currentError || !currentSession) { setMessage(currentError?.message ?? "Completed workout not found."); setLoading(false); return; }
    const { data: currentExercises, error: exerciseError } = await supabase.from("exercise_sessions").select("exercise_id, exercise_name_snapshot, position, notes, sets(weight, reps, partial_reps, set_type, set_number)").eq("workout_session_id", params.id).order("position", { ascending: true });
    if (exerciseError) { setMessage(exerciseError.message); setLoading(false); return; }
    const { data: previousSession } = await supabase.from("workout_sessions").select("id").eq("athlete_user_id", user.id).eq("workout_id", currentSession.workout_id).eq("status", "completed").lt("completed_at", currentSession.completed_at).order("completed_at", { ascending: false }).limit(1).maybeSingle();
    let previousExercises: ExerciseSession[] = [];
    if (previousSession) { const { data } = await supabase.from("exercise_sessions").select("exercise_id, exercise_name_snapshot, position, notes, sets(weight, reps, partial_reps, set_type, set_number)").eq("workout_session_id", previousSession.id); previousExercises = (data ?? []) as ExerciseSession[]; }

    const current = (currentExercises ?? []) as ExerciseSession[];
    const reportRows: ReportRow[] = [];
    for (const exercise of current) {
      const previous = previousExercises.find((candidate) => candidate.exercise_id === exercise.exercise_id) ?? null;
      const { data: historicalExerciseSessions } = await supabase.from("exercise_sessions").select("sets(weight, reps, partial_reps, set_type)").eq("exercise_id", exercise.exercise_id).neq("workout_session_id", params.id);
      const historicalSets = ((historicalExerciseSessions ?? []) as { sets: RawSet[] }[]).flatMap((item) => item.sets ?? []);
      reportRows.push({ name: exercise.exercise_name_snapshot, position: exercise.position, result: scoreExercisePerformance({ sets: normalizeSets(exercise.sets ?? []), notes: exercise.notes }, previous ? { sets: normalizeSets(previous.sets ?? []), notes: previous.notes } : null), prs: detectPersonalRecords(prSets(exercise.sets ?? []), prSets(historicalSets)) });
    }

    if (previousSession) {
      setStrengthChange(calculateStrengthChange(
        current.map((exercise) => ({ exerciseId: exercise.exercise_id, sets: strengthSets(exercise.sets ?? []) })),
        previousExercises.map((exercise) => ({ exerciseId: exercise.exercise_id, sets: strengthSets(exercise.sets ?? []) })),
      ));
    } else setStrengthChange(null);

    const firstExercise = [...current].sort((a,b) => a.position-b.position)[0]; const previousFirst = firstExercise ? previousExercises.find((candidate) => candidate.exercise_id === firstExercise.exercise_id) ?? null : null; const firstSets = firstExercise ? normalizeSets(firstExercise.sets ?? []).filter((set) => set.setType !== "warmup").slice(0, 3) : []; const previousSets = previousFirst ? normalizeSets(previousFirst.sets ?? []).filter((set) => set.setType !== "warmup").slice(0, 3) : [];
    setTopSetScores(firstSets.map((set, index) => scoreSingleSet(set, previousSets[index] ?? null))); setSession(currentSession); setRows(reportRows); setLoading(false);
  }, [params.id]);

  useEffect(() => { loadReport(); }, [loadReport]);
  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Building your PHATBOT report...</main>;
  if (!session) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p>{message}</p><Link href="/" className="mt-6 inline-block underline">Dashboard</Link></main>;

  const comparableTop = topSetScores.filter((result) => result.result !== "baseline"); const topAverage = comparableTop.length ? comparableTop.reduce((sum, result) => sum + result.score, 0) / comparableTop.length : null; const accessoryRows = rows.filter((row) => row.position > 1 && row.result.result !== "baseline"); const accessoryAverage = accessoryRows.length ? accessoryRows.reduce((sum, row) => sum + row.result.score, 0) / accessoryRows.length : null; const score = topAverage === null ? (accessoryAverage === null ? null : Math.round(accessoryAverage * 100)) : accessoryAverage === null ? Math.round(topAverage * 100) : Math.round(((topAverage * 0.6) + (accessoryAverage * 0.4)) * 100); const progressed = rows.filter((row) => row.result.result === "progression").length; const neutral = rows.filter((row) => row.result.result === "neutral" || row.result.result === "baseline").length; const regressed = rows.filter((row) => row.result.result === "regression").length; const allPRs = rows.flatMap((row) => row.prs.map((pr) => ({ ...pr, exercise: row.name })));
  const strengthPercent = strengthChange?.percentageChange ?? null;

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6"><header><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">Workout Report</p><h1 className="mt-2 text-3xl font-bold">{session.workout_name_snapshot}</h1><p className="mt-2 text-zinc-400">Did you improve today?</p></header>
    {allPRs.length > 0 && <section className="rounded-2xl border border-zinc-600 p-6"><p className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-400">🏆 Personal Records</p><h2 className="mt-2 text-2xl font-bold">{allPRs.length} PR{allPRs.length === 1 ? "" : "s"} today</h2><div className="mt-4 flex flex-col gap-3">{allPRs.map((pr,index) => <div key={`${pr.exercise}-${pr.type}-${pr.weight}-${index}`} className="rounded-xl bg-zinc-900 p-4"><p className="font-semibold">{pr.exercise}</p><p className="mt-1 text-sm text-zinc-300">{pr.message}</p></div>)}</div></section>}
    <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-zinc-800 p-6 text-center"><p className="text-sm uppercase tracking-widest text-zinc-500">Progressive Overload Score</p><p className="mt-2 text-5xl font-black">{score === null ? "BASELINE" : `${score}%`}</p><p className="mt-3 text-sm text-zinc-400">{score === null ? "First comparable workout." : `${progressed} progressed · ${neutral} neutral · ${regressed} regressed`}</p></div><div className="rounded-2xl border border-zinc-800 p-6 text-center"><p className="text-sm uppercase tracking-widest text-zinc-500">Strength vs Last Workout</p><p className="mt-2 text-5xl font-black">{strengthPercent === null ? "N/A" : `${strengthPercent >= 0 ? "+" : ""}${strengthPercent.toFixed(1)}%`}</p><p className="mt-3 text-sm text-zinc-400">{strengthChange?.comparableExerciseCount ? `${strengthChange.comparableExerciseCount} comparable exercise${strengthChange.comparableExerciseCount === 1 ? "" : "s"} · load × full reps` : "Complete this workout again to establish a comparison."}</p></div></section>
    {score !== null && <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-zinc-900 p-4 text-center"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Top Block · 60%</p><p className="mt-1 text-2xl font-bold">{topAverage === null ? "N/A" : `${Math.round(topAverage*100)}%`}</p><p className="mt-1 text-xs text-zinc-500">First 3 non-warmup sets of Exercise 1</p></div><div className="rounded-xl bg-zinc-900 p-4 text-center"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Rest of Workout · 40%</p><p className="mt-1 text-2xl font-bold">{accessoryAverage === null ? "N/A" : `${Math.round(accessoryAverage*100)}%`}</p><p className="mt-1 text-xs text-zinc-500">Exercises 2 onward</p></div></section>}
    <section className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400"><strong className="text-zinc-200">Strength change:</strong> compares this workout with the previous completion of the same workout using common exercises only. PHATBOT totals weight × completed full reps, excludes warmups and does not count partial reps as full reps. This is a training-volume strength indicator, separate from your Progressive Overload Score.</section>
    {topSetScores.length > 0 && <section className="rounded-xl border border-zinc-800 p-5"><h2 className="font-semibold">Top Block Set Results</h2><div className="mt-3 flex flex-col gap-2">{topSetScores.map((result,index) => <div key={index} className="flex items-center justify-between rounded-lg bg-zinc-900 p-3 text-sm"><span>Set {index+1}{result.currentBest ? ` · ${result.currentBest.weight} × ${result.currentBest.reps}` : ""}</span><span className="text-xs font-bold uppercase">{result.result}</span></div>)}</div></section>}
    <section className="flex flex-col gap-3">{rows.map((row) => <article key={`${row.position}-${row.name}`} className="rounded-xl border border-zinc-800 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-zinc-500">Exercise {row.position}{row.position === 1 ? " · Contains Top Block" : " · Rest of Workout"}</p><h2 className="mt-1 text-lg font-semibold">{row.name}</h2></div><span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold uppercase">{row.result.result}</span></div><p className="mt-3 text-sm text-zinc-300">{explainExerciseScore(row.result.explanationCode)}</p>{row.result.currentBest && <p className="mt-2 text-xs text-zinc-500">Current best: {row.result.currentBest.weight} × {row.result.currentBest.reps}{row.result.previousBest ? ` · Previous: ${row.result.previousBest.weight} × ${row.result.previousBest.reps}` : ""}</p>}{row.prs.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{row.prs.map((pr,index) => <span key={`${pr.type}-${index}`} className="rounded-full border border-zinc-600 px-3 py-1 text-xs font-bold">🏆 {pr.type === "heaviest_weight" ? "WEIGHT PR" : "REP PR"}</span>)}</div>}</article>)}</section><Link href="/" className="rounded-lg bg-white px-5 py-3 text-center font-semibold text-black">Back to Dashboard</Link></main>;
}
