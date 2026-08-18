"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type SetType = "warmup" | "working" | "top" | "backoff" | "drop" | "rest_pause";
type LoggedSet = { id: string; set_number: number; set_type: SetType; weight: number; reps: number; partial_reps: number; notes: string | null };
type ExerciseSession = { id: string; exercise_name_snapshot: string; position: number; notes: string | null; sets: LoggedSet[] };
type Session = { id: string; workout_name_snapshot: string; status: string; started_at: string; notes: string | null };
type Draft = { weight: string; reps: string; partials: string; setType: SetType; notes: string };

const setTypeLabels: Record<SetType, string> = { warmup: "Warmup", working: "Working", top: "Top Set", backoff: "Backoff", drop: "Drop Set", rest_pause: "Rest-Pause" };

export default function LiveWorkoutPage() {
  const params = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [exercises, setExercises] = useState<ExerciseSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [workoutNotes, setWorkoutNotes] = useState("");
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});

  const loadSession = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/auth"; return; }
    const { data: sessionData, error: sessionError } = await supabase.from("workout_sessions").select("id, workout_name_snapshot, status, started_at, notes").eq("id", params.id).eq("athlete_user_id", user.id).single();
    if (sessionError || !sessionData) { setMessage(sessionError?.message ?? "Workout session not found."); setLoading(false); return; }
    const { data: exerciseData, error: exerciseError } = await supabase.from("exercise_sessions").select("id, exercise_name_snapshot, position, notes, sets(id, set_number, set_type, weight, reps, partial_reps, notes)").eq("workout_session_id", params.id).order("position", { ascending: true });
    if (exerciseError) setMessage(exerciseError.message);
    const normalized = ((exerciseData ?? []) as ExerciseSession[]).map((item) => ({ ...item, sets: [...(item.sets ?? [])].sort((a,b) => a.set_number-b.set_number) }));
    setSession(sessionData); setWorkoutNotes(sessionData.notes ?? ""); setExercises(normalized);
    setExerciseNotes(Object.fromEntries(normalized.map((item) => [item.id, item.notes ?? ""]))); setLoading(false);
  }, [params.id]);

  useEffect(() => { loadSession(); }, [loadSession]);

  function draftFor(id: string): Draft { return drafts[id] ?? { weight: "", reps: "", partials: "0", setType: "working", notes: "" }; }
  function updateDraft(id: string, field: keyof Draft, value: string) { setDrafts((current) => ({ ...current, [id]: { ...draftFor(id), [field]: value } })); }

  async function addSet(exercise: ExerciseSession) {
    const draft = draftFor(exercise.id); const weight = Number(draft.weight); const reps = Number(draft.reps); const partials = Number(draft.partials || 0);
    if (draft.weight === "" || draft.reps === "" || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 0 || !Number.isInteger(partials) || partials < 0) { setMessage("Enter a valid weight, full reps, and partial reps."); return; }
    setWorking(true); setMessage(""); const supabase = createSupabaseBrowserClient(); const nextSet = exercise.sets.reduce((max, set) => Math.max(max, set.set_number), 0) + 1;
    const { error } = await supabase.from("sets").insert({ exercise_session_id: exercise.id, set_number: nextSet, set_type: draft.setType, weight, reps, partial_reps: partials, notes: draft.notes.trim() || null });
    if (error) setMessage(error.message); else { setDrafts((current) => ({ ...current, [exercise.id]: { weight: draft.weight, reps: "", partials: "0", setType: draft.setType === "warmup" ? "working" : draft.setType, notes: "" } })); await loadSession(); } setWorking(false);
  }

  async function removeSet(setId: string) { setWorking(true); setMessage(""); const supabase = createSupabaseBrowserClient(); const { error } = await supabase.from("sets").delete().eq("id", setId); if (error) setMessage(error.message); else await loadSession(); setWorking(false); }

  async function saveNotes() {
    setWorking(true); setMessage(""); const supabase = createSupabaseBrowserClient();
    const results = await Promise.all([supabase.from("workout_sessions").update({ notes: workoutNotes.trim() || null }).eq("id", params.id), ...exercises.map((exercise) => supabase.from("exercise_sessions").update({ notes: (exerciseNotes[exercise.id] ?? "").trim() || null }).eq("id", exercise.id))]);
    const error = results.find((result) => result.error)?.error; setMessage(error ? error.message : "Notes saved."); setWorking(false);
  }

  async function completeWorkout() {
    if (exercises.some((exercise) => exercise.sets.length === 0)) { setMessage("Log at least one set for every exercise before completing the workout."); return; }
    setWorking(true); setMessage(""); const supabase = createSupabaseBrowserClient();
    const noteResults = await Promise.all([supabase.from("workout_sessions").update({ notes: workoutNotes.trim() || null }).eq("id", params.id), ...exercises.map((exercise) => supabase.from("exercise_sessions").update({ notes: (exerciseNotes[exercise.id] ?? "").trim() || null }).eq("id", exercise.id))]);
    const noteError = noteResults.find((result) => result.error)?.error; if (noteError) { setMessage(noteError.message); setWorking(false); return; }
    const { error } = await supabase.from("workout_sessions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", params.id).eq("status", "in_progress");
    if (error) { setMessage(error.message); setWorking(false); return; } window.location.href = "/";
  }

  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Loading workout...</main>;
  if (!session) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p>{message}</p><Link href="/workouts" className="mt-6 inline-block underline">Back to workouts</Link></main>;

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">Live Workout</p><h1 className="mt-2 text-3xl font-bold">{session.workout_name_snapshot}</h1><p className="mt-2 text-sm text-zinc-400">Log warmups, working sets, top sets, backoffs, drop sets, rest-pause work, and notes.</p></header>
    {message && <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-200">{message}</p>}
    <section className="rounded-2xl border border-zinc-800 p-5"><label className="text-sm font-semibold">Workout notes<textarea value={workoutNotes} onChange={(e) => setWorkoutNotes(e.target.value)} placeholder="Energy, pain, setup changes, overall notes..." rows={3} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 font-normal" /></label></section>
    {exercises.map((exercise) => { const draft = draftFor(exercise.id); return <section key={exercise.id} className="rounded-2xl border border-zinc-800 p-5">
      <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold">{exercise.position}</span><h2 className="text-xl font-semibold">{exercise.exercise_name_snapshot}</h2></div>
      <textarea value={exerciseNotes[exercise.id] ?? ""} onChange={(e) => setExerciseNotes((current) => ({ ...current, [exercise.id]: e.target.value }))} placeholder="Exercise notes..." rows={2} className="mt-4 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm" />
      {exercise.sets.length > 0 && <div className="mt-5 flex flex-col gap-2">{exercise.sets.map((set) => <div key={set.id} className="rounded-lg bg-zinc-900 p-3"><div className="grid grid-cols-[auto_1fr_auto] items-center gap-3"><span className="text-xs font-semibold uppercase text-zinc-500">{setTypeLabels[set.set_type] ?? set.set_type}</span><span>Set {set.set_number}: {set.weight} × {set.reps}{set.partial_reps > 0 ? ` + ${set.partial_reps} partial` : ""}</span><button disabled={working} onClick={() => removeSet(set.id)} className="text-xs text-zinc-500 hover:text-red-300">Remove</button></div>{set.notes && <p className="mt-2 text-xs text-zinc-400">{set.notes}</p>}</div>)}</div>}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><label className="text-xs text-zinc-400">Set type<select value={draft.setType} onChange={(e) => updateDraft(exercise.id, "setType", e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-3 text-sm text-white">{Object.entries(setTypeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs text-zinc-400">Weight<input type="number" min="0" step="0.25" value={draft.weight} onChange={(e) => updateDraft(exercise.id, "weight", e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base" /></label><label className="text-xs text-zinc-400">Full reps<input type="number" min="0" step="1" value={draft.reps} onChange={(e) => updateDraft(exercise.id, "reps", e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base" /></label><label className="text-xs text-zinc-400">Partials<input type="number" min="0" step="1" value={draft.partials} onChange={(e) => updateDraft(exercise.id, "partials", e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base" /></label></div>
      <input value={draft.notes} onChange={(e) => updateDraft(exercise.id, "notes", e.target.value)} placeholder="Set note (optional)" className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm" />
      <button disabled={working} onClick={() => addSet(exercise)} className="mt-3 w-full rounded-lg border border-zinc-600 px-4 py-3 font-semibold disabled:opacity-50">+ Add Set</button>
    </section>; })}
    <button disabled={working} onClick={saveNotes} className="rounded-lg border border-zinc-600 px-5 py-3 font-semibold disabled:opacity-50">Save Notes</button>
    {session.status === "in_progress" ? <button disabled={working} onClick={completeWorkout} className="rounded-lg bg-white px-5 py-4 font-bold text-black disabled:opacity-50">{working ? "Saving..." : "Complete Workout"}</button> : <p className="rounded-lg border border-zinc-800 p-4 text-center">Workout completed.</p>}
  </main>;
}
