"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  summarizeCrossAthleteExercise,
  type AthleteExerciseExposure,
  type CrossAthleteExerciseSummary,
} from "@/features/exercises/crossAthlete";

type LinkRow = { athlete_user_id: string };
type ProfileRow = { id: string; display_name: string | null };
type AthleteProfileRow = { user_id: string; preferred_unit: "lb" | "kg" | null };
type WorkoutRow = { id: string; athlete_user_id: string; completed_at: string };
type ExerciseRow = {
  exercise_id: string;
  workout_session_id: string;
  sets: Array<{
    weight: number;
    reps: number;
    set_type: string;
    load_type?: "external_load" | "bodyweight" | "assisted_bodyweight" | null;
  }>;
};
type IdentityRow = {
  exercise_id: string;
  canonical_exercise_id: string;
  canonical_name: string | null;
};

function performanceText(summary: CrossAthleteExerciseSummary["latest"], unit: "lb" | "kg") {
  return summary ? `${summary.weight} ${unit} × ${summary.reps}` : "—";
}

function improvementText(value: number | null) {
  if (value === null) return "Baseline";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export default function CoachExerciseComparisonPage() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [exposures, setExposures] = useState<AthleteExerciseExposure[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }

      const { data: allowed } = await supabase.rpc("has_coach_dashboard_access", { p_user_id: user.id });
      if (!allowed) { setLoading(false); return; }
      setEnabled(true);

      const { data: linkRows, error: linksError } = await supabase
        .from("coach_athletes")
        .select("athlete_user_id")
        .eq("coach_user_id", user.id)
        .eq("active", true);

      if (linksError) {
        setMessage(linksError.message);
        setLoading(false);
        return;
      }

      const athleteIds = [...new Set([user.id, ...((linkRows ?? []) as LinkRow[]).map((row) => row.athlete_user_id)])];
      if (!athleteIds.length) {
        setLoading(false);
        return;
      }

      const [profilesResult, athleteProfilesResult, workoutsResult] = await Promise.all([
        supabase.from("profiles").select("id,display_name").in("id", athleteIds),
        supabase.from("athlete_profiles").select("user_id,preferred_unit").in("user_id", athleteIds),
        supabase
          .from("workout_sessions")
          .select("id,athlete_user_id,completed_at")
          .in("athlete_user_id", athleteIds)
          .eq("status", "completed")
          .order("completed_at", { ascending: true }),
      ]);

      if (profilesResult.error || athleteProfilesResult.error || workoutsResult.error) {
        setMessage(profilesResult.error?.message ?? athleteProfilesResult.error?.message ?? workoutsResult.error?.message ?? "Unable to load athlete history.");
        setLoading(false);
        return;
      }

      const workouts = (workoutsResult.data ?? []) as WorkoutRow[];
      const workoutIds = workouts.map((row) => row.id);
      if (!workoutIds.length) {
        setLoading(false);
        return;
      }

      const { data: exerciseRows, error: exerciseError } = await supabase
        .from("exercise_sessions")
        .select("exercise_id,workout_session_id,sets(weight,reps,set_type,load_type)")
        .in("workout_session_id", workoutIds);

      if (exerciseError) {
        setMessage(exerciseError.message);
        setLoading(false);
        return;
      }

      const exercises = (exerciseRows ?? []) as unknown as ExerciseRow[];
      const rawExerciseIds = [...new Set(exercises.map((row) => row.exercise_id))];
      const { data: identityRows, error: identityError } = await supabase
        .from("exercise_identity")
        .select("exercise_id,canonical_exercise_id,canonical_name")
        .in("exercise_id", rawExerciseIds);

      if (identityError) {
        setMessage("Unable to load canonical exercise identity.");
        setLoading(false);
        return;
      }

      const profileById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((row) => [row.id, row.display_name?.trim() || "Athlete"]));
      const unitById = new Map(((athleteProfilesResult.data ?? []) as AthleteProfileRow[]).map((row) => [row.user_id, row.preferred_unit === "kg" ? "kg" as const : "lb" as const]));
      const workoutById = new Map(workouts.map((row) => [row.id, row]));
      const identityByRawId = new Map(((identityRows ?? []) as IdentityRow[]).map((row) => [row.exercise_id, row]));

      const built: AthleteExerciseExposure[] = exercises.flatMap((row) => {
        const workout = workoutById.get(row.workout_session_id);
        const identity = identityByRawId.get(row.exercise_id);
        if (!workout || !identity) return [];
        return [{
          athleteId: workout.athlete_user_id,
          athleteName: profileById.get(workout.athlete_user_id) ?? "Athlete",
          unit: unitById.get(workout.athlete_user_id) ?? "lb",
          canonicalExerciseId: identity.canonical_exercise_id,
          canonicalExerciseName: identity.canonical_name?.trim() || "Exercise",
          completedAt: workout.completed_at,
          sets: row.sets ?? [],
        }];
      });

      if (cancelled) return;
      setExposures(built);
      const exerciseOptions = Array.from(new Map(built.map((row) => [row.canonicalExerciseId, row.canonicalExerciseName])).entries()).sort((a, b) => a[1].localeCompare(b[1]));
      if (exerciseOptions.length) setSelected(exerciseOptions[0][0]);
      setLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const exercises = useMemo(
    () => Array.from(new Map(exposures.map((row) => [row.canonicalExerciseId, row.canonicalExerciseName])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [exposures],
  );
  const selectedName = exercises.find(([id]) => id === selected)?.[1] ?? "Exercise";
  const summaries = useMemo(() => selected ? summarizeCrossAthleteExercise(exposures, selected) : [], [exposures, selected]);

  if (loading) return <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">Beep boop... standardizing athlete lift history.</main>;
  if (!enabled) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p>Coach analysis is available only to approved coach accounts.</p><Link href="/" className="mt-5 inline-block underline">Back to PHATBOT</Link></main>;

  return <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
    <header>
      <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Coach · Standardized Lifts</p>
      <h1 className="mt-2 text-3xl font-black">Compare progression across athletes</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">PHATBOT groups equivalent historical exercise names under one canonical lift, then shows each athlete's own progression. This is a coaching comparison, not an athlete ranking.</p>
    </header>

    {message && <p className="rounded-xl border border-amber-700/50 p-4 text-sm text-amber-200">{message}</p>}

    {exercises.length ? <label className="flex flex-col gap-2 text-sm font-semibold">
      Canonical exercise
      <select value={selected} onChange={(event) => setSelected(event.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3">
        {exercises.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label> : <section className="rounded-2xl border border-zinc-800 p-5 text-zinc-400">No comparable completed strength history is available yet.</section>}

    {selected && <section className="rounded-2xl border border-zinc-800 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Canonical Lift</p>
          <h2 className="mt-1 text-2xl font-black">{selectedName}</h2>
        </div>
        <p className="text-xs text-zinc-500">{summaries.length} athlete{summaries.length === 1 ? "" : "s"} with comparable history</p>
      </div>

      <div className="mt-5 grid gap-3">
        {summaries.length ? summaries.map((summary) => <article key={summary.athleteId} className="rounded-xl border border-zinc-800 bg-black/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-black">{summary.athleteName}</h3>
              <p className="mt-1 text-xs text-zinc-500">{summary.exposures} comparable exposure{summary.exposures === 1 ? "" : "s"}</p>
            </div>
            <Link href={`/coach/athletes/${summary.athleteId}/trends/exercises?exercise=${encodeURIComponent(selected)}`} className="text-sm font-black text-[#ff0032]">Open trend →</Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-600">First</p><p className="mt-1 font-bold">{performanceText(summary.first, summary.unit)}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-600">Latest</p><p className="mt-1 font-bold">{performanceText(summary.latest, summary.unit)}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-600">Best</p><p className="mt-1 font-bold">{performanceText(summary.best, summary.unit)}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-600">First → Latest</p><p className={`mt-1 font-black ${summary.improvementPercent !== null && summary.improvementPercent > 0 ? "text-[#ff0032]" : ""}`}>{improvementText(summary.improvementPercent)}</p></div>
          </div>
        </article>) : <p className="text-sm text-zinc-500">No athletes have comparable scored sets for this exercise yet.</p>}
      </div>
    </section>}

    <div className="grid gap-3 sm:grid-cols-2">
      <Link href="/coach" className="rounded-xl border border-zinc-700 px-5 py-3 text-center font-black">Coach Dashboard</Link>
      <Link href="/coach/import" className="rounded-xl border border-zinc-700 px-5 py-3 text-center font-black">Import History</Link>
    </div>
  </main>;
}
