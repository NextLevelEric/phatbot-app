"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { scoreExercisePerformance, type PerformanceSet } from "@/features/scoring/progressiveOverload";
import { calculateStrengthChange } from "@/features/scoring/strengthChange";
import { calculateWeightedWorkoutScore } from "@/features/scoring/workoutScore";

type RawSet = { weight: number; reps: number; partial_reps: number; set_type: string; set_number: number };
type ExerciseSession = { exercise_id: string; position: number; notes: string | null; sets: RawSet[] };
type WorkoutSession = { id: string; workout_id: string; workout_name_snapshot: string; completed_at: string; notes: string | null };
type WeeklyWorkout = { id: string; name: string; completedAt: string; score: number | null; strengthChange: number | null; skipped: number; techniqueProtected: boolean };
type DailyMetric = { metric_date: string; steps: number | null; active_energy_kcal: number | null };
type CardioActivity = { activity_name: string | null; started_at: string; duration_seconds: number; distance_meters: number | null; average_heart_rate_bpm: number | null };
type WeeklyActivity = { avgSteps: number | null; activeKcal: number; cardioSessions: number; cardioMinutes: number; topCardio: CardioActivity | null };

function normalize(sets: RawSet[]): PerformanceSet[] {
  return [...sets]
    .sort((a, b) => a.set_number - b.set_number)
    .filter((s) => ["warmup", "working", "top", "backoff"].includes(s.set_type))
    .map((s) => ({ weight: Number(s.weight), reps: s.reps, partialReps: s.partial_reps, setType: s.set_type as PerformanceSet["setType"] }));
}
function startOfWeek() { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); d.setHours(0, 0, 0, 0); return d; }
function endOfWeek(start: Date) { const d = new Date(start); d.setDate(d.getDate() + 6); d.setHours(23, 59, 59, 999); return d; }
function dateKey(d: Date) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${day}`; }
function notes(workout: string | null | undefined, exercise: string | null | undefined) { return [workout, exercise].filter(Boolean).join(" ").trim() || null; }
function protectedTechnique(code: string) { return ["lower_weight_improved_quality", "fewer_reps_improved_quality"].includes(code); }
function cardioName(activity: CardioActivity) { return (activity.activity_name ?? "Workout").trim().toLowerCase(); }
function isCardio(activity: CardioActivity) { const name = cardioName(activity); return ["run", "running", "walk", "walking", "bike", "cycling", "hike", "rowing", "swim", "elliptical", "stair", "mixed cardio", "hiit"].some((label) => name.includes(label)); }
function miles(meters: number | null) { return meters == null ? null : meters / 1609.344; }
function duration(seconds: number) { const mins = Math.round(seconds / 60); const h = Math.floor(mins / 60), m = mins % 60; return h ? `${h}h ${m}m` : `${m} min`; }

export default function WeeklyPage() {
  const [workouts, setWorkouts] = useState<WeeklyWorkout[]>([]);
  const [activity, setActivity] = useState<WeeklyActivity>({ avgSteps: null, activeKcal: 0, cardioSessions: 0, cardioMinutes: 0, topCardio: null });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const weekStart = startOfWeek(), weekEnd = endOfWeek(weekStart);

      const [sessionsResult, dailyResult, cardioResult] = await Promise.all([
        supabase.from("workout_sessions").select("id, workout_id, workout_name_snapshot, completed_at, notes").eq("athlete_user_id", user.id).eq("status", "completed").gte("completed_at", weekStart.toISOString()).lte("completed_at", weekEnd.toISOString()).order("completed_at", { ascending: true }),
        supabase.from("health_daily_metrics").select("metric_date,steps,active_energy_kcal").eq("athlete_user_id", user.id).gte("metric_date", dateKey(weekStart)).lte("metric_date", dateKey(weekEnd)).order("metric_date", { ascending: true }),
        supabase.from("cardio_activities").select("activity_name,started_at,duration_seconds,distance_meters,average_heart_rate_bpm").eq("athlete_user_id", user.id).gte("started_at", weekStart.toISOString()).lte("started_at", weekEnd.toISOString()).order("started_at", { ascending: false }),
      ]);

      if (sessionsResult.error) { setMessage(sessionsResult.error.message); setLoading(false); return; }

      const daily = (dailyResult.data ?? []) as DailyMetric[];
      const stepDays = daily.filter((d) => d.steps != null);
      const cardio = ((cardioResult.data ?? []) as CardioActivity[]).filter(isCardio);
      const topCardio = [...cardio].sort((a, b) => Number(b.duration_seconds) - Number(a.duration_seconds))[0] ?? null;
      setActivity({
        avgSteps: stepDays.length ? Math.round(stepDays.reduce((sum, d) => sum + Number(d.steps ?? 0), 0) / stepDays.length) : null,
        activeKcal: Math.round(daily.reduce((sum, d) => sum + Number(d.active_energy_kcal ?? 0), 0)),
        cardioSessions: cardio.length,
        cardioMinutes: Math.round(cardio.reduce((sum, a) => sum + Number(a.duration_seconds), 0) / 60),
        topCardio,
      });

      const results: WeeklyWorkout[] = [];
      for (const session of (sessionsResult.data ?? []) as WorkoutSession[]) {
        const { data: currentData } = await supabase.from("exercise_sessions").select("exercise_id, position, notes, sets(weight,reps,partial_reps,set_type,set_number)").eq("workout_session_id", session.id).order("position");
        const current = (currentData ?? []) as ExerciseSession[];
        const skipped = current.filter((x) => (x.sets ?? []).length === 0).length;
        const completed = current.filter((x) => (x.sets ?? []).length > 0);
        const { data: previousSession } = await supabase.from("workout_sessions").select("id, notes").eq("athlete_user_id", user.id).eq("workout_id", session.workout_id).eq("status", "completed").lt("completed_at", session.completed_at).order("completed_at", { ascending: false }).limit(1).maybeSingle();
        if (!previousSession) { results.push({ id: session.id, name: session.workout_name_snapshot, completedAt: session.completed_at, score: null, strengthChange: null, skipped, techniqueProtected: false }); continue; }
        const { data: previousData } = await supabase.from("exercise_sessions").select("exercise_id, position, notes, sets(weight,reps,partial_reps,set_type,set_number)").eq("workout_session_id", previousSession.id);
        const previous = (previousData ?? []) as ExerciseSession[];
        const first = [...completed].sort((a, b) => a.position - b.position)[0];
        const pf = first ? previous.find((x) => x.exercise_id === first.exercise_id) : null;
        const fs = first ? normalize(first.sets).filter((s) => s.setType !== "warmup").slice(0, 3) : [];
        const ps = pf ? normalize(pf.sets).filter((s) => s.setType !== "warmup").slice(0, 3) : [];
        const top = fs.map((s, i) => scoreExercisePerformance({ sets: [s], notes: notes(session.notes, first?.notes) }, ps[i] ? { sets: [ps[i]], notes: notes(previousSession.notes, pf?.notes) } : null));
        const rest = completed.filter((x) => x.position !== first?.position).map((x) => { const p = previous.find((y) => y.exercise_id === x.exercise_id); return scoreExercisePerformance({ sets: normalize(x.sets), notes: notes(session.notes, x.notes) }, p ? { sets: normalize(p.sets), notes: notes(previousSession.notes, p.notes) } : null); });
        const workoutScore = calculateWeightedWorkoutScore(top, rest);
        const strength = calculateStrengthChange(completed.map((x) => ({ exerciseId: x.exercise_id, sets: x.sets.map((s) => ({ weight: Number(s.weight), reps: s.reps, setType: s.set_type })) })), previous.map((x) => ({ exerciseId: x.exercise_id, sets: x.sets.map((s) => ({ weight: Number(s.weight), reps: s.reps, setType: s.set_type })) }))).percentageChange;
        results.push({ id: session.id, name: session.workout_name_snapshot, completedAt: session.completed_at, score: workoutScore.percentage, strengthChange: strength, skipped, techniqueProtected: top.some((r) => protectedTechnique(r.explanationCode)) || rest.some((r) => protectedTechnique(r.explanationCode)) });
      }

      const scoredResults = results.filter((w) => w.score !== null);
      const weeklyScore = scoredResults.length ? scoredResults.reduce((sum, w) => sum + (w.score ?? 0), 0) / scoredResults.length / 100 : null;
      const { error: weeklyError } = await supabase.from("weekly_scores").upsert({ athlete_user_id: user.id, week_start: dateKey(weekStart), week_end: dateKey(weekEnd), score: weeklyScore, completed_workout_count: results.length }, { onConflict: "athlete_user_id,week_start" });
      if (weeklyError) setMessage(`Weekly report loaded, but PHATBOT could not archive the weekly score: ${weeklyError.message}`);
      setWorkouts(results);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Beep boop... calculating this week.</main>;
  const scored = workouts.filter((w) => w.score !== null);
  const avg = scored.length ? Math.round(scored.reduce((s, w) => s + (w.score ?? 0), 0) / scored.length) : null;
  const strength = workouts.filter((w) => w.strengthChange !== null);
  const avgStrength = strength.length ? strength.reduce((s, w) => s + (w.strengthChange ?? 0), 0) / strength.length : null;
  const protectedCount = workouts.filter((w) => w.techniqueProtected).length;
  const topMiles = miles(activity.topCardio?.distance_meters ?? null);

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
    <header><p className="text-sm font-semibold uppercase tracking-[.25em] text-zinc-400">PHATBOT Weekly</p><h1 className="mt-2 text-3xl font-bold">Your week in training</h1><p className="mt-2 text-zinc-400">Strength, progressive overload, activity, and cardio signals rolled into one weekly view.</p></header>
    {message && <p className="rounded-xl border border-zinc-800 p-4 text-sm">{message}</p>}
    <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-zinc-800 p-6 text-center"><p className="text-sm uppercase tracking-widest text-zinc-500">Weekly Performance Score</p><p className="mt-2 text-5xl font-black">{avg === null ? "BASELINE" : `${avg}%`}</p><p className="mt-3 text-sm text-zinc-400">{scored.length} comparable · {workouts.length} completed</p></div><div className="rounded-2xl border border-zinc-800 p-6 text-center"><p className="text-sm uppercase tracking-widest text-zinc-500">Avg Strength vs Prior</p><p className="mt-2 text-5xl font-black">{avgStrength === null ? "N/A" : `${avgStrength >= 0 ? "+" : ""}${avgStrength.toFixed(1)}%`}</p><p className="mt-3 text-sm text-zinc-400">Across {strength.length} comparable workout{strength.length === 1 ? "" : "s"}</p></div></section>

    <section className="rounded-2xl border border-zinc-800 p-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff0032]">Apple Health This Week</p><h2 className="mt-1 text-xl font-bold">Activity & cardio</h2></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="text-xs text-zinc-500">Avg steps</p><p className="mt-1 text-xl font-black">{activity.avgSteps?.toLocaleString() ?? "—"}</p></div><div><p className="text-xs text-zinc-500">Active kcal</p><p className="mt-1 text-xl font-black">{activity.activeKcal.toLocaleString()}</p></div><div><p className="text-xs text-zinc-500">Cardio sessions</p><p className="mt-1 text-xl font-black">{activity.cardioSessions}</p></div><div><p className="text-xs text-zinc-500">Cardio minutes</p><p className="mt-1 text-xl font-black">{activity.cardioMinutes}</p></div></div>{activity.topCardio ? <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-zinc-500">Longest cardio effort</p><div className="mt-2 flex items-end justify-between gap-4"><div><p className="font-bold">{activity.topCardio.activity_name ?? "Workout"}</p><p className="mt-1 text-sm text-zinc-400">{new Date(activity.topCardio.started_at).toLocaleDateString()}{topMiles != null ? ` · ${topMiles.toFixed(2)} mi` : ""}{activity.topCardio.average_heart_rate_bpm != null ? ` · ${Math.round(Number(activity.topCardio.average_heart_rate_bpm))} bpm avg` : ""}</p></div><p className="font-black">{duration(Number(activity.topCardio.duration_seconds))}</p></div></div> : <p className="mt-4 text-sm text-zinc-500">No Apple Health cardio sessions synced for this week yet.</p>}<Link href="/progress/activity" className="mt-4 inline-block text-sm font-semibold underline">Review activity & cardio trends →</Link></section>

    {protectedCount > 0 && <section className="rounded-xl border border-zinc-700 p-4"><p className="text-xs font-bold uppercase tracking-[.2em] text-zinc-400">PHATBOT Technique Context Preserved</p><p className="mt-2 text-sm text-zinc-300">{protectedCount} workout{protectedCount === 1 ? "" : "s"} included form, control, tempo, ROM, or time-under-tension improvements that PHATBOT protected from being scored as regressions.</p></section>}
    <section className="flex flex-col gap-3">{workouts.length === 0 ? <div className="rounded-xl border border-zinc-800 p-5 text-zinc-400">No completed workouts yet this week.</div> : workouts.map((w) => <Link key={w.id} href={`/sessions/${w.id}/report`} className="rounded-xl border border-zinc-800 p-5"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold">{w.name}</p><p className="mt-1 text-xs text-zinc-500">{new Date(w.completedAt).toLocaleDateString()}</p><p className="mt-2 text-sm text-zinc-400">Strength: {w.strengthChange === null ? "N/A" : `${w.strengthChange >= 0 ? "+" : ""}${w.strengthChange.toFixed(1)}%`}</p>{w.skipped > 0 && <p className="mt-1 text-xs text-zinc-500">{w.skipped} skipped exercise{w.skipped === 1 ? "" : "s"} excluded from scoring</p>}{w.techniqueProtected && <p className="mt-1 text-xs font-semibold text-zinc-300">PHATBOT protected a technique improvement</p>}</div><p className="text-2xl font-bold">{w.score === null ? "Baseline" : `${w.score}%`}</p></div></Link>)}</section>
    <section className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400">Weekly scoring follows the workout report rules: skipped exercises are excluded, technique-quality notes are respected, strength compares completed work against the prior completion of the same workout, and Apple Health activity is summarized separately so cardio never distorts your strength score.</section>
    <div className="grid gap-3 sm:grid-cols-2"><Link href="/progress" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">Progress Trend</Link><Link href="/" className="rounded-lg bg-white px-5 py-3 text-center font-semibold text-black">Back to Dashboard</Link></div>
  </main>;
}
