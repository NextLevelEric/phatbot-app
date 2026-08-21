"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { scoreExercisePerformance, type PerformanceSet } from "@/features/scoring/progressiveOverload";

type SetType = "warmup" | "working" | "top" | "backoff" | "drop" | "rest_pause";
type LoggedSet = { id: string; set_number: number; set_type: SetType; weight: number; reps: number; partial_reps: number; notes: string | null };
type ExerciseSession = { id: string; exercise_id: string; exercise_name_snapshot: string; position: number; notes: string | null; prescribed_set_targets_snapshot: string[]; sets: LoggedSet[] };
type Session = { id: string; workout_id: string | null; workout_name_snapshot: string; status: string; started_at: string; notes: string | null };
type Draft = { weight: string; reps: string; partials: string; setType: SetType; notes: string };
type PreviousExercise = { completedAt: string; sets: LoggedSet[] };

const setTypeLabels: Record<SetType, string> = { warmup: "Warmup", working: "Working", top: "Top Set", backoff: "Backoff", drop: "Drop Set", rest_pause: "Rest-Pause" };
const MAX_WEIGHT = 5000;
const MAX_REPS = 100;
const MAX_SET_NOTE = 500;
const MAX_EXERCISE_NOTE = 1000;
const MAX_WORKOUT_NOTE = 2000;

function asPerformanceSet(set: LoggedSet): PerformanceSet | null {
  if (!["working", "top", "backoff"].includes(set.set_type)) return null;
  return { weight: Number(set.weight), reps: set.reps, partialReps: set.partial_reps, setType: set.set_type as PerformanceSet["setType"] };
}

function setIsLiveWin(exercise: ExerciseSession, set: LoggedSet, previous?: PreviousExercise) {
  const currentSet = asPerformanceSet(set);
  if (!currentSet || !previous) return false;
  const currentComparable = exercise.sets.filter((item) => asPerformanceSet(item) !== null);
  const currentIndex = currentComparable.findIndex((item) => item.id === set.id);
  if (currentIndex < 0) return false;
  const previousComparable = previous.sets.map(asPerformanceSet).filter((item): item is PerformanceSet => item !== null);
  const previousSet = previousComparable[currentIndex];
  if (!previousSet) return false;
  return scoreExercisePerformance({ sets: [currentSet] }, { sets: [previousSet] }).result === "progression";
}

export default function LiveWorkoutPage() {
  const params = useParams<{ id: string }>();
  const actionLock = useRef(false);
  const [session, setSession] = useState<Session | null>(null); const [exercises, setExercises] = useState<ExerciseSession[]>([]); const [previousByExercise, setPreviousByExercise] = useState<Record<string, PreviousExercise>>({}); const [weightUnit, setWeightUnit] = useState<"lb" | "kg">("lb"); const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false); const [message, setMessage] = useState(""); const [drafts, setDrafts] = useState<Record<string, Draft>>({}); const [workoutNotes, setWorkoutNotes] = useState(""); const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});

  const loadSession = useCallback(async () => {
    const supabase = createSupabaseBrowserClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) { window.location.href = "/auth"; return; }
    const { data: athleteProfile } = await supabase.from("athlete_profiles").select("preferred_unit").eq("user_id", user.id).single(); setWeightUnit(athleteProfile?.preferred_unit === "kg" ? "kg" : "lb");
    const { data: sessionData, error: sessionError } = await supabase.from("workout_sessions").select("id, workout_id, workout_name_snapshot, status, started_at, notes").eq("id", params.id).eq("athlete_user_id", user.id).single();
    if (sessionError || !sessionData) { setMessage(sessionError?.message ?? "Workout session not found."); setLoading(false); return; }
    const { data: exerciseData, error: exerciseError } = await supabase.from("exercise_sessions").select("id, exercise_id, exercise_name_snapshot, position, notes, prescribed_set_targets_snapshot, sets(id, set_number, set_type, weight, reps, partial_reps, notes)").eq("workout_session_id", params.id).order("position", { ascending: true });
    if (exerciseError) setMessage(exerciseError.message); const normalized = ((exerciseData ?? []) as ExerciseSession[]).map((item) => ({ ...item, prescribed_set_targets_snapshot: item.prescribed_set_targets_snapshot ?? [], sets: [...(item.sets ?? [])].sort((a,b) => a.set_number-b.set_number) }));
    const previousMap: Record<string, PreviousExercise> = {};
    if (sessionData.workout_id && normalized.length > 0) {
      const { data: previousSession } = await supabase.from("workout_sessions").select("id, completed_at").eq("athlete_user_id", user.id).eq("workout_id", sessionData.workout_id).eq("status", "completed").lt("started_at", sessionData.started_at).order("completed_at", { ascending: false }).limit(1).maybeSingle();
      if (previousSession) { const { data: previousExercises } = await supabase.from("exercise_sessions").select("exercise_id, sets(id, set_number, set_type, weight, reps, partial_reps, notes)").eq("workout_session_id", previousSession.id); for (const item of (previousExercises ?? []) as { exercise_id: string; sets: LoggedSet[] }[]) previousMap[item.exercise_id] = { completedAt: previousSession.completed_at ?? "", sets: [...(item.sets ?? [])].sort((a,b) => a.set_number-b.set_number) }; }
    }
    setSession(sessionData); setWorkoutNotes(sessionData.notes ?? ""); setExercises(normalized); setPreviousByExercise(previousMap); setExerciseNotes(Object.fromEntries(normalized.map((item) => [item.id, item.notes ?? ""]))); setLoading(false);
  }, [params.id]);
  useEffect(() => { loadSession(); }, [loadSession]);

  function draftFor(id: string): Draft { return drafts[id] ?? { weight: "", reps: "", partials: "0", setType: "working", notes: "" }; }
  function updateDraft(id: string, field: keyof Draft, value: string) { setDrafts((current) => ({ ...current, [id]: { ...draftFor(id), [field]: value } })); }
  function completionIssue() { if (exercises.length === 0) return "This workout has no exercises to complete."; if (!exercises.some((exercise) => exercise.sets.length > 0)) return "Log at least one set somewhere in the workout before completing it."; return ""; }
  function skippedExercises() { return exercises.filter((exercise) => exercise.sets.length === 0); }
  function validateNotes() { if (workoutNotes.length > MAX_WORKOUT_NOTE) return `Workout notes must be ${MAX_WORKOUT_NOTE} characters or fewer.`; const tooLong = exercises.find((exercise) => (exerciseNotes[exercise.id] ?? "").length > MAX_EXERCISE_NOTE); if (tooLong) return `${tooLong.exercise_name_snapshot} notes must be ${MAX_EXERCISE_NOTE} characters or fewer.`; return ""; }
  function beginAction() { if (actionLock.current) { setMessage("Beep boop. One action is already processing. Your data is protected from duplicate taps."); return false; } actionLock.current = true; setWorking(true); return true; }
  function endAction() { actionLock.current = false; setWorking(false); }

  async function addSet(exercise: ExerciseSession) {
    if (session?.status !== "in_progress") { setMessage("This workout is already complete. PHATBOT has locked the training log."); return; }
    const draft = draftFor(exercise.id); const weight = Number(draft.weight); const reps = Number(draft.reps); const partials = Number(draft.partials || 0);
    if (draft.weight === "" || draft.reps === "" || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 0 || !Number.isInteger(partials) || partials < 0) { setMessage(`PHATBOT input check: enter a valid weight in ${weightUnit}, full reps, and partial reps.`); return; }
    if (weight > MAX_WEIGHT) { setMessage(`PHATBOT input check: weight cannot exceed ${MAX_WEIGHT} ${weightUnit}. Check for an accidental extra digit.`); return; }
    if (Math.round(weight * 100) !== weight * 100) { setMessage("PHATBOT input check: weight can use at most 2 decimal places."); return; }
    if (reps > MAX_REPS || partials > MAX_REPS) { setMessage(`PHATBOT input check: reps and partials must be ${MAX_REPS} or fewer. Check for an accidental extra digit.`); return; }
    if (reps === 0 && partials === 0) { setMessage("PHATBOT input check: a set needs at least one full or partial rep."); return; }
    if (draft.notes.length > MAX_SET_NOTE) { setMessage(`Set notes must be ${MAX_SET_NOTE} characters or fewer.`); return; }
    if (!beginAction()) return;
    try {
      setMessage(""); const supabase = createSupabaseBrowserClient(); const nextSet = exercise.sets.reduce((max, set) => Math.max(max, set.set_number), 0) + 1;
      const { error } = await supabase.from("sets").insert({ exercise_session_id: exercise.id, set_number: nextSet, set_type: draft.setType, weight, reps, partial_reps: partials, notes: draft.notes.trim() || null });
      if (error) setMessage(error.message); else { setDrafts((current) => ({ ...current, [exercise.id]: { weight: draft.weight, reps: "", partials: "0", setType: draft.setType === "warmup" ? "working" : draft.setType, notes: "" } })); setMessage(`Beep boop. Set logged in ${weightUnit}.`); await loadSession(); }
    } catch { setMessage("PHATBOT lost the signal while saving that set. Nothing else was changed. Please try again."); } finally { endAction(); }
  }

  async function removeSet(setId: string) {
    if (session?.status !== "in_progress" || !beginAction()) return;
    try { setMessage(""); const supabase = createSupabaseBrowserClient(); const { error } = await supabase.from("sets").delete().eq("id", setId); if (error) setMessage(error.message); else { setMessage("Set removed. Sensors recalibrated."); await loadSession(); } }
    catch { setMessage("PHATBOT lost the signal while removing that set. Refresh before trying again."); } finally { endAction(); }
  }

  async function saveNotes() {
    if (session?.status !== "in_progress") return; const noteIssue = validateNotes(); if (noteIssue) { setMessage(noteIssue); return; } if (!beginAction()) return;
    try { setMessage(""); const supabase = createSupabaseBrowserClient(); const results = await Promise.all([supabase.from("workout_sessions").update({ notes: workoutNotes.trim() || null }).eq("id", params.id).eq("status","in_progress"), ...exercises.map((exercise) => supabase.from("exercise_sessions").update({ notes: (exerciseNotes[exercise.id] ?? "").trim() || null }).eq("id", exercise.id))]); const error = results.find((result) => result.error)?.error; setMessage(error ? error.message : "Beep boop. Notes saved."); }
    catch { setMessage("PHATBOT lost the signal while saving notes. Please try again."); } finally { endAction(); }
  }

  async function cancelWorkout() {
    if (session?.status !== "in_progress") return;
    const confirmed = window.confirm("Cancel this workout? PHATBOT will discard it from your active training history, scores, streaks, reports, and performance data.");
    if (!confirmed || !beginAction()) return;
    try {
      setMessage("PHATBOT is discarding this workout...");
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.from("workout_sessions").update({ status: "cancelled" }).eq("id", params.id).eq("status", "in_progress").select("id").maybeSingle();
      if (error) { setMessage(error.message); return; }
      if (!data) { setMessage("This workout is no longer active. Returning to the dashboard."); }
      window.location.href = "/";
    } catch { setMessage("PHATBOT lost the signal before cancellation was confirmed. Refresh the workout before trying again."); }
    finally { endAction(); }
  }

  async function completeWorkout() {
    if (session?.status !== "in_progress") { window.location.href = `/sessions/${params.id}/report`; return; }
    const issue = completionIssue() || validateNotes(); if (issue) { setMessage(issue); return; } if (!beginAction()) return;
    const skipped = skippedExercises();
    try {
      setMessage(skipped.length ? `PHATBOT is completing the workout and excluding ${skipped.length} skipped exercise${skipped.length === 1 ? "" : "s"} from your score...` : "PHATBOT is locking in your workout and calculating the damage..."); const supabase = createSupabaseBrowserClient(); const noteResults = await Promise.all([supabase.from("workout_sessions").update({ notes: workoutNotes.trim() || null }).eq("id", params.id).eq("status","in_progress"), ...exercises.map((exercise) => supabase.from("exercise_sessions").update({ notes: (exerciseNotes[exercise.id] ?? "").trim() || null }).eq("id", exercise.id))]); const noteError = noteResults.find((result) => result.error)?.error; if (noteError) { setMessage(noteError.message); return; }
      const { data, error } = await supabase.from("workout_sessions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", params.id).eq("status", "in_progress").select("id").maybeSingle(); if (error) { setMessage(error.message); return; } if (!data) { window.location.href = `/sessions/${params.id}/report`; return; } window.location.href = `/sessions/${params.id}/report`;
    } catch { setMessage("PHATBOT lost the signal before completion was confirmed. Refresh this workout before trying again so we do not duplicate anything."); } finally { endAction(); }
  }

  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Beep boop... loading workout telemetry.</main>;
  if (!session) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p>{message}</p><Link href="/workouts" className="mt-6 inline-block underline">Back to workouts</Link></main>;
  const issue = completionIssue(); const skipped = skippedExercises(); const completed = session.status !== "in_progress";
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6"><header><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT Live Workout</p><h1 className="mt-2 text-3xl font-bold">{session.workout_name_snapshot}</h1><p className="mt-2 text-sm text-zinc-400">Coach targets and previous performance are shown together with each exercise so you know the goal and the signal to beat.</p><p className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Weight unit: {weightUnit}</p></header>{message && <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-200">🤖 {message}</p>}{completed&&<p className="rounded-xl border border-zinc-700 p-4 text-sm">Workout complete. Training log locked to protect your report data.</p>}<section className="rounded-2xl border border-zinc-800 p-5"><label className="text-sm font-semibold">Workout notes<textarea disabled={completed} maxLength={MAX_WORKOUT_NOTE} value={workoutNotes} onChange={(e) => setWorkoutNotes(e.target.value)} placeholder="Energy, pain, setup changes, overall notes..." rows={3} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 font-normal disabled:opacity-60" /></label><p className="mt-1 text-right text-[11px] text-zinc-600">{workoutNotes.length}/{MAX_WORKOUT_NOTE}</p></section>
    {exercises.map((exercise) => { const draft = draftFor(exercise.id); const previous = previousByExercise[exercise.exercise_id]; const targets = exercise.prescribed_set_targets_snapshot ?? []; return <section key={exercise.id} className="rounded-2xl border border-zinc-800 p-5"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold">{exercise.position}</span><h2 className="text-xl font-semibold">{exercise.exercise_name_snapshot}</h2>{exercise.sets.length===0&&<span className="ml-auto rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-bold uppercase text-zinc-500">Unscored if skipped</span>}</div><div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">{targets.length>0&&<div className="border-b border-zinc-800 pb-4"><p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Coach Target</p><div className="mt-3 flex flex-col gap-2">{targets.map((target,index)=><div key={`${target}-${index}`} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${index===exercise.sets.length&&!completed?"bg-zinc-800":"bg-zinc-950/50"}`}><span className="text-xs font-semibold uppercase text-zinc-500">Set {index+1}</span><span className="font-bold">{target}</span></div>)}</div>{!completed&&exercise.sets.length<targets.length&&<p className="mt-2 text-xs text-zinc-500">Next prescribed set highlighted.</p>}</div>}<div className={targets.length>0?"pt-4":""}><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Last Workout · {weightUnit}</p>{previous?.completedAt && <p className="text-xs text-zinc-500">{new Date(previous.completedAt).toLocaleDateString()}</p>}</div>{previous && previous.sets.length > 0 ? <div className="mt-3 flex flex-col gap-2">{previous.sets.map((set) => <div key={set.id} className="flex items-center justify-between gap-3 text-sm"><span className="text-xs font-semibold uppercase text-zinc-500">{setTypeLabels[set.set_type] ?? set.set_type} {set.set_number}</span><span className="font-semibold">{set.weight} {weightUnit} × {set.reps}{set.partial_reps > 0 ? ` + ${set.partial_reps} partial` : ""}</span></div>)}</div> : <p className="mt-2 text-sm text-zinc-500">No previous performance detected. This workout establishes the baseline.</p>}</div></div><textarea disabled={completed} maxLength={MAX_EXERCISE_NOTE} value={exerciseNotes[exercise.id] ?? ""} onChange={(e) => setExerciseNotes((current) => ({ ...current, [exercise.id]: e.target.value }))} placeholder="Exercise notes..." rows={2} className="mt-4 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-60" />{exercise.sets.length > 0 && <div className="mt-5 flex flex-col gap-2">{exercise.sets.map((set) => { const liveWin = setIsLiveWin(exercise, set, previous); return <div key={set.id} className={`rounded-lg p-3 ${liveWin ? "border border-[#ff0032]/50 bg-[#ff0032]/10" : "bg-zinc-900"}`}><div className="grid grid-cols-[auto_1fr_auto] items-center gap-3"><span className="text-xs font-semibold uppercase text-zinc-500">{setTypeLabels[set.set_type] ?? set.set_type}</span><span>Set {set.set_number}: {set.weight} {weightUnit} × {set.reps}{set.partial_reps > 0 ? ` + ${set.partial_reps} partial` : ""}{liveWin&&<span className="ml-2 inline-flex items-center rounded-full bg-[#ff0032] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">W ↑</span>}</span>{!completed&&<button disabled={working} onClick={() => removeSet(set.id)} className="text-xs text-zinc-500 hover:text-red-300 disabled:opacity-40">Remove</button>}</div>{set.notes && <p className="mt-2 text-xs text-zinc-400">{set.notes}</p>}</div>;})}</div>}{!completed&&<><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><label className="text-xs text-zinc-400">Set type<select disabled={working} value={draft.setType} onChange={(e) => updateDraft(exercise.id, "setType", e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-3 text-sm text-white disabled:opacity-50">{Object.entries(setTypeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs text-zinc-400">Weight ({weightUnit})<input disabled={working} type="number" min="0" max={MAX_WEIGHT} step="0.25" value={draft.weight} onChange={(e) => updateDraft(exercise.id, "weight", e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base disabled:opacity-50" /></label><label className="text-xs text-zinc-400">Full reps<input disabled={working} type="number" min="0" max={MAX_REPS} step="1" value={draft.reps} onChange={(e) => updateDraft(exercise.id, "reps", e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base disabled:opacity-50" /></label><label className="text-xs text-zinc-400">Partials<input disabled={working} type="number" min="0" max={MAX_REPS} step="1" value={draft.partials} onChange={(e) => updateDraft(exercise.id, "partials", e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base disabled:opacity-50" /></label></div><input disabled={working} maxLength={MAX_SET_NOTE} value={draft.notes} onChange={(e) => updateDraft(exercise.id, "notes", e.target.value)} placeholder="Set note (optional)" className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" /><button disabled={working} onClick={() => addSet(exercise)} className="mt-3 w-full rounded-lg border border-zinc-600 px-4 py-3 font-semibold disabled:opacity-50">+ Add Set</button></>}</section>; })}
    {!completed&&<button disabled={working} onClick={saveNotes} className="rounded-lg border border-zinc-600 px-5 py-3 font-semibold disabled:opacity-50">Save Notes</button>}{!completed&&issue&&<p className="text-center text-sm text-zinc-500">Completion check: {issue}</p>}{!completed&&!issue&&skipped.length>0&&<p className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400">🤖 {skipped.length} exercise{skipped.length===1?"":"s"} currently have no sets. You can still complete this workout. PHATBOT will treat them as skipped and exclude them from the Progressive Overload Score.</p>}{!completed&&<button disabled={working} onClick={cancelWorkout} className="rounded-lg border border-zinc-700 px-5 py-3 font-semibold text-zinc-300 hover:border-[#ff0032] hover:text-white disabled:opacity-40">Cancel Workout</button>}{!completed ? <button disabled={working||Boolean(issue)} onClick={completeWorkout} className="rounded-lg bg-white px-5 py-4 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">{working ? "PHATBOT Processing..." : skipped.length?`Complete Workout · Skip ${skipped.length}`:"Complete Workout"}</button> : <Link href={`/sessions/${params.id}/report`} className="rounded-lg bg-white px-5 py-4 text-center font-bold text-black">View Workout Report</Link>}
  </main>;
}