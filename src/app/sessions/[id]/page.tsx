"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type LoggedSet = { id: string; set_number: number; weight: number; reps: number; partial_reps: number };
type ExerciseSession = { id: string; exercise_name_snapshot: string; position: number; sets: LoggedSet[] };
type Session = { id: string; workout_name_snapshot: string; status: string; started_at: string };

export default function LiveWorkoutPage() {
  const params = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [exercises, setExercises] = useState<ExerciseSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { weight: string; reps: string; partials: string }>>({});

  const loadSession = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/auth"; return; }

    const { data: sessionData, error: sessionError } = await supabase
      .from("workout_sessions")
      .select("id, workout_name_snapshot, status, started_at")
      .eq("id", params.id)
      .eq("athlete_user_id", user.id)
      .single();

    if (sessionError || !sessionData) {
      setMessage(sessionError?.message ?? "Workout session not found.");
      setLoading(false);
      return;
    }

    const { data: exerciseData, error: exerciseError } = await supabase
      .from("exercise_sessions")
      .select("id, exercise_name_snapshot, position, sets(id, set_number, weight, reps, partial_reps)")
      .eq("workout_session_id", params.id)
      .order("position", { ascending: true });

    if (exerciseError) setMessage(exerciseError.message);
    setSession(sessionData);
    setExercises(((exerciseData ?? []) as ExerciseSession[]).map((item) => ({ ...item, sets: [...(item.sets ?? [])].sort((a,b) => a.set_number-b.set_number) })));
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadSession(); }, [loadSession]);

  function updateDraft(exerciseId: string, field: "weight" | "reps" | "partials", value: string) {
    setDrafts((current) => ({ ...current, [exerciseId]: { weight: current[exerciseId]?.weight ?? "", reps: current[exerciseId]?.reps ?? "", partials: current[exerciseId]?.partials ?? "0", [field]: value } }));
  }

  async function addSet(exercise: ExerciseSession) {
    const draft = drafts[exercise.id] ?? { weight: "", reps: "", partials: "0" };
    const weight = Number(draft.weight);
    const reps = Number(draft.reps);
    const partials = Number(draft.partials || 0);
    if (draft.weight === "" || draft.reps === "" || !Number.isFinite(weight) || !Number.isInteger(reps) || reps < 0 || weight < 0 || !Number.isInteger(partials) || partials < 0) {
      setMessage("Enter a valid weight, full reps, and partial reps."); return;
    }

    setWorking(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const nextSet = exercise.sets.reduce((max, set) => Math.max(max, set.set_number), 0) + 1;
    const { error } = await supabase.from("sets").insert({ exercise_session_id: exercise.id, set_number: nextSet, set_type: "working", weight, reps, partial_reps: partials });
    if (error) setMessage(error.message);
    else { setDrafts((current) => ({ ...current, [exercise.id]: { weight: draft.weight, reps: "", partials: "0" } })); await loadSession(); }
    setWorking(false);
  }

  async function removeSet(setId: string) {
    setWorking(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("sets").delete().eq("id", setId);
    if (error) setMessage(error.message); else await loadSession();
    setWorking(false);
  }

  async function completeWorkout() {
    if (exercises.some((exercise) => exercise.sets.length === 0)) {
      setMessage("Log at least one set for every exercise before completing the workout."); return;
    }
    setWorking(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("workout_sessions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", params.id).eq("status", "in_progress");
    if (error) { setMessage(error.message); setWorking(false); return; }
    window.location.href = "/";
  }

  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Loading workout...</main>;
  if (!session) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p>{message}</p><Link href="/workouts" className="mt-6 inline-block underline">Back to workouts</Link></main>;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">Live Workout</p>
        <h1 className="mt-2 text-3xl font-bold">{session.workout_name_snapshot}</h1>
        <p className="mt-2 text-sm text-zinc-400">Log each working set as you go.</p>
      </header>

      {message && <p className="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">{message}</p>}

      {exercises.map((exercise) => {
        const draft = drafts[exercise.id] ?? { weight: "", reps: "", partials: "0" };
        return (
          <section key={exercise.id} className="rounded-2xl border border-zinc-800 p-5">
            <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold">{exercise.position}</span><h2 className="text-xl font-semibold">{exercise.exercise_name_snapshot}</h2></div>

            {exercise.sets.length > 0 && <div className="mt-5 flex flex-col gap-2">{exercise.sets.map((set) => (
              <div key={set.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg bg-zinc-900 p-3">
                <span className="text-sm font-semibold text-zinc-400">Set {set.set_number}</span>
                <span>{set.weight} × {set.reps}{set.partial_reps > 0 ? ` + ${set.partial_reps} partial` : ""}</span>
                <button disabled={working} onClick={() => removeSet(set.id)} className="text-xs text-zinc-500 hover:text-red-300">Remove</button>
              </div>
            ))}</div>}

            <div className="mt-5 grid grid-cols-3 gap-2">
              <label className="text-xs text-zinc-400">Weight<input inputMode="decimal" type="number" min="0" step="0.25" value={draft.weight} onChange={(e) => updateDraft(exercise.id, "weight", e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white" /></label>
              <label className="text-xs text-zinc-400">Full reps<input inputMode="numeric" type="number" min="0" step="1" value={draft.reps} onChange={(e) => updateDraft(exercise.id, "reps", e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white" /></label>
              <label className="text-xs text-zinc-400">Partials<input inputMode="numeric" type="number" min="0" step="1" value={draft.partials} onChange={(e) => updateDraft(exercise.id, "partials", e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white" /></label>
            </div>
            <button disabled={working} onClick={() => addSet(exercise)} className="mt-3 w-full rounded-lg border border-zinc-600 px-4 py-3 font-semibold disabled:opacity-50">+ Add Set</button>
          </section>
        );
      })}

      {session.status === "in_progress" ? <button disabled={working} onClick={completeWorkout} className="rounded-lg bg-white px-5 py-4 font-bold text-black disabled:opacity-50">{working ? "Saving..." : "Complete Workout"}</button> : <p className="rounded-lg border border-zinc-800 p-4 text-center">Workout completed.</p>}
    </main>
  );
}
