"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Workout = { id: string; name: string; description: string | null };
type Exercise = { id: string; name: string; muscle_group: string | null; equipment: string | null };
type WorkoutExercise = { id: string; position: number; target_rep_min: number | null; target_rep_max: number | null; exercise: Exercise };

export default function WorkoutDetailPage() {
  const params = useParams<{ id: string }>();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscleGroup, setCustomMuscleGroup] = useState("");
  const [customEquipment, setCustomEquipment] = useState("");

  const loadPage = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/auth"; return; }
    const [workoutResult, workoutExercisesResult, exercisesResult] = await Promise.all([
      supabase.from("workouts").select("id, name, description").eq("id", params.id).eq("athlete_user_id", user.id).single(),
      supabase.from("workout_exercises").select("id, position, target_rep_min, target_rep_max, exercise:exercises(id, name, muscle_group, equipment)").eq("workout_id", params.id).order("position", { ascending: true }),
      supabase.from("exercises").select("id, name, muscle_group, equipment").eq("is_active", true).order("name", { ascending: true }),
    ]);
    if (workoutResult.error) { setMessage(workoutResult.error.message); setWorkout(null); } else setWorkout(workoutResult.data);
    if (workoutExercisesResult.error) setMessage(workoutExercisesResult.error.message); else setWorkoutExercises((workoutExercisesResult.data ?? []) as unknown as WorkoutExercise[]);
    if (exercisesResult.error) setMessage(exercisesResult.error.message); else setAvailableExercises(exercisesResult.data ?? []);
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadPage(); }, [loadPage]);

  const addedExerciseIds = useMemo(() => new Set(workoutExercises.map((item) => item.exercise.id)), [workoutExercises]);
  const filteredExercises = useMemo(() => {
    const query = search.trim().toLowerCase();
    return availableExercises.filter((exercise) => !addedExerciseIds.has(exercise.id) && (!query || [exercise.name, exercise.muscle_group, exercise.equipment].filter(Boolean).some((value) => value!.toLowerCase().includes(query))));
  }, [availableExercises, addedExerciseIds, search]);

  async function addExercise(exerciseId: string) {
    setWorking(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const nextPosition = workoutExercises.reduce((max, item) => Math.max(max, item.position), 0) + 1;
    const { error } = await supabase.from("workout_exercises").insert({ workout_id: params.id, exercise_id: exerciseId, position: nextPosition, target_rep_min: 6, target_rep_max: 12, minimum_progression_reps: 1 });
    if (error) setMessage(error.message); else await loadPage(); setWorking(false);
  }

  async function createAndAddExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const name = customName.trim(); if (!name) { setMessage("Enter an exercise name."); return; }
    setWorking(true); setMessage(""); const supabase = createSupabaseBrowserClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/auth"; return; }
    const { data, error } = await supabase.from("exercises").insert({ name, muscle_group: customMuscleGroup.trim() || null, equipment: customEquipment.trim() || null, created_by: user.id }).select("id").single();
    if (error) { setMessage(error.message); setWorking(false); return; }
    const nextPosition = workoutExercises.reduce((max, item) => Math.max(max, item.position), 0) + 1;
    const { error: addError } = await supabase.from("workout_exercises").insert({ workout_id: params.id, exercise_id: data.id, position: nextPosition, target_rep_min: 6, target_rep_max: 12, minimum_progression_reps: 1 });
    if (addError) setMessage(addError.message); else { setCustomName(""); setCustomMuscleGroup(""); setCustomEquipment(""); setSearch(""); setShowAdd(false); await loadPage(); } setWorking(false);
  }

  async function removeExercise(id: string) { setWorking(true); setMessage(""); const supabase = createSupabaseBrowserClient(); const { error } = await supabase.from("workout_exercises").delete().eq("id", id); if (error) setMessage(error.message); else await loadPage(); setWorking(false); }

  async function startWorkout() {
    if (!workout || workoutExercises.length === 0) return;
    setWorking(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/auth"; return; }

    const { data: existing } = await supabase.from("workout_sessions").select("id").eq("athlete_user_id", user.id).eq("workout_id", workout.id).eq("status", "in_progress").order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) { window.location.href = `/sessions/${existing.id}`; return; }

    const { data: newSession, error } = await supabase.from("workout_sessions").insert({ athlete_user_id: user.id, workout_id: workout.id, workout_name_snapshot: workout.name, status: "in_progress" }).select("id").single();
    if (error || !newSession) { setMessage(error?.message ?? "Unable to start workout."); setWorking(false); return; }

    const sessionExercises = workoutExercises.map((item) => ({ workout_session_id: newSession.id, workout_exercise_id: item.id, exercise_id: item.exercise.id, exercise_name_snapshot: item.exercise.name, position: item.position }));
    const { error: exerciseError } = await supabase.from("exercise_sessions").insert(sessionExercises);
    if (exerciseError) { await supabase.from("workout_sessions").delete().eq("id", newSession.id); setMessage(exerciseError.message); setWorking(false); return; }
    window.location.href = `/sessions/${newSession.id}`;
  }

  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Loading workout...</main>;
  if (!workout) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p>{message || "Workout not found."}</p><Link href="/workouts" className="mt-6 inline-block underline">Back to My Workouts</Link></main>;

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-10">
    <header><Link href="/workouts" className="text-sm text-zinc-400 hover:text-white">← My Workouts</Link><p className="mt-6 text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">Workout Template</p><h1 className="mt-2 text-3xl font-bold">{workout.name}</h1>{workout.description && <p className="mt-2 text-zinc-300">{workout.description}</p>}</header>
    {message && <p className="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">{message}</p>}
    <section className="rounded-2xl border border-zinc-800 p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Exercises</h2><p className="mt-1 text-sm text-zinc-400">Build this workout in the order you perform it.</p></div><button onClick={() => setShowAdd((v) => !v)} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">{showAdd ? "Done" : "+ Add Exercise"}</button></div>
      {workoutExercises.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-zinc-700 p-6 text-center text-zinc-400">No exercises added yet.</p> : <ol className="mt-6 flex flex-col gap-3">{workoutExercises.map((item) => <li key={item.id} className="flex items-center gap-4 rounded-xl border border-zinc-800 p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold">{item.position}</span><div className="min-w-0 flex-1"><p className="font-semibold">{item.exercise.name}</p><p className="mt-1 text-sm text-zinc-400">{item.target_rep_min ?? "—"}–{item.target_rep_max ?? "—"} reps{item.exercise.muscle_group ? ` · ${item.exercise.muscle_group}` : ""}{item.exercise.equipment ? ` · ${item.exercise.equipment}` : ""}</p></div><button disabled={working} onClick={() => removeExercise(item.id)} className="text-sm text-zinc-500 hover:text-red-300">Remove</button></li>)}</ol>}
    </section>
    {showAdd && <section className="rounded-2xl border border-zinc-800 p-6"><h2 className="text-xl font-semibold">Add Exercise</h2><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search exercises" className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" />{filteredExercises.length > 0 && <div className="mt-4 flex max-h-72 flex-col gap-2 overflow-y-auto">{filteredExercises.map((exercise) => <button key={exercise.id} disabled={working} onClick={() => addExercise(exercise.id)} className="flex items-center justify-between rounded-lg border border-zinc-800 p-4 text-left"><span><span className="block font-semibold">{exercise.name}</span><span className="mt-1 block text-sm text-zinc-500">{[exercise.muscle_group, exercise.equipment].filter(Boolean).join(" · ") || "Exercise"}</span></span><span className="text-sm font-semibold">Add</span></button>)}</div>}<div className="my-6 flex items-center gap-3 text-sm text-zinc-600"><span className="h-px flex-1 bg-zinc-800" /><span>Create your own</span><span className="h-px flex-1 bg-zinc-800" /></div><form onSubmit={createAndAddExercise} className="flex flex-col gap-3"><input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Exercise name" className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" /><div className="grid gap-3 sm:grid-cols-2"><input value={customMuscleGroup} onChange={(e) => setCustomMuscleGroup(e.target.value)} placeholder="Muscle group (optional)" className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" /><input value={customEquipment} onChange={(e) => setCustomEquipment(e.target.value)} placeholder="Equipment (optional)" className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" /></div><button disabled={working} className="rounded-lg border border-zinc-600 px-5 py-3 font-semibold">{working ? "Adding..." : "Create + Add Exercise"}</button></form></section>}
    <button disabled={working || workoutExercises.length === 0} onClick={startWorkout} className="rounded-lg bg-white px-5 py-4 font-bold text-black disabled:opacity-50">{working ? "Starting..." : `Start ${workout.name}`}</button>
  </main>;
}
