"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  assignmentSourceLabel,
  buildNextProgramWorkout,
  formatAssignmentDate,
  formatProgramStartDate,
  formatPrescriptionTargets,
  friendlyProgramError,
  reviewDateStatus,
  type NextProgramWorkout,
  type NextProgramWorkoutRow,
  type ProgramAssignment,
} from "@/features/programs/programUi";

type Day = { id: string; program_id: string; day_number: number; name: string };
type Prescription = { program_day_id: string; exercise_id: string; position: number; prescribed_set_targets: string[]; notes: string | null };
type Exercise = { id: string; name: string };
type RotationDay = Day & { exercises: Array<Prescription & { name: string }> };

export default function CurrentProgramPage() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<ProgramAssignment[]>([]);
  const [next, setNext] = useState<NextProgramWorkout | null>(null);
  const [rotation, setRotation] = useState<RotationDay[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const [historyResult, nextResult] = await Promise.all([
        supabase.rpc("get_athlete_program_assignments", { p_athlete_user_id: user.id }),
        supabase.rpc("get_next_program_workout", { p_athlete_user_id: user.id }),
      ]);
      if (!mounted) return;
      if (historyResult.error || nextResult.error) { setMessage(friendlyProgramError("load")); setLoading(false); return; }
      const assignments = (historyResult.data ?? []) as ProgramAssignment[];
      const active = assignments.find((assignment) => assignment.assignment_status === "active") ?? null;
      const nextWorkout = buildNextProgramWorkout((nextResult.data ?? []) as NextProgramWorkoutRow[]);
      setHistory(assignments);
      setNext(nextWorkout);
      if (!active) { setLoading(false); return; }
      const daysResult = await supabase.from("training_program_days").select("id,program_id,day_number,name").eq("program_id", active.program_version_id).order("day_number");
      if (!mounted) return;
      if (daysResult.error) { setMessage(friendlyProgramError("load")); setLoading(false); return; }
      const days = (daysResult.data ?? []) as Day[];
      const dayIds = days.map((day) => day.id);
      const prescriptionsResult = dayIds.length
        ? await supabase.from("training_program_exercises").select("program_day_id,exercise_id,position,prescribed_set_targets,notes").in("program_day_id", dayIds).order("position")
        : { data: [], error: null };
      if (!mounted) return;
      if (prescriptionsResult.error) { setMessage(friendlyProgramError("load")); setLoading(false); return; }
      const prescriptions = (prescriptionsResult.data ?? []) as Prescription[];
      const exerciseIds = [...new Set(prescriptions.map((item) => item.exercise_id))];
      const exercisesResult = exerciseIds.length
        ? await supabase.from("exercises").select("id,name").in("id", exerciseIds)
        : { data: [], error: null };
      if (!mounted) return;
      if (exercisesResult.error) { setMessage(friendlyProgramError("load")); setLoading(false); return; }
      const names = new Map(((exercisesResult.data ?? []) as Exercise[]).map((exercise) => [exercise.id, exercise.name]));
      setRotation(days.map((day) => ({ ...day, exercises: prescriptions.filter((item) => item.program_day_id === day.id).map((item) => ({ ...item, name: names.get(item.exercise_id) ?? "Exercise" })) })));
      setExpanded(nextWorkout?.dayId ?? days[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <main className="mx-auto min-h-screen max-w-3xl px-5 py-10"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Your Program</p><h1 className="mt-2 text-3xl font-black">Loading your rotation...</h1></main>;
  if (message && history.length === 0) return <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-10"><section className="rounded-3xl border border-amber-700/50 p-6"><p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">Program unavailable</p><h1 className="mt-2 text-2xl font-black">Your program details didn&apos;t load.</h1><p className="mt-3 text-sm text-zinc-400">{message}</p><button type="button" onClick={() => window.location.reload()} className="mt-5 w-full rounded-xl bg-white px-4 py-3 font-black text-black">Try Again</button></section></main>;
  const active = history.find((assignment) => assignment.assignment_status === "active") ?? null;
  const scheduled = history.find((assignment) => assignment.assignment_status === "scheduled") ?? null;
  const previous = history.filter((assignment) => assignment.assignment_status === "ended");
  if (!active && !scheduled) return <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-10"><section className="rounded-3xl border border-zinc-800 p-6 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">No active program</p><h1 className="mt-2 text-2xl font-black">Train your way—or choose a rotation.</h1><p className="mt-3 text-sm text-zinc-400">Nothing is wrong. PHATBOT programs are optional.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><Link href="/programs" className="rounded-xl bg-[#ff0032] px-4 py-3 font-black">Browse Programs</Link><Link href="/workouts" className="rounded-xl border border-zinc-700 px-4 py-3 font-black">My Workouts</Link></div></section></main>;
  if (!active && scheduled) return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10"><header><p className="text-xs font-black uppercase tracking-[.22em] text-zinc-500">Current Program</p><h1 className="mt-2 text-3xl font-black">No active program</h1><p className="mt-2 text-sm text-zinc-400">Keep using your own workouts until your scheduled program begins.</p></header><section className="rounded-3xl border border-[#ff0032]/50 bg-[#ff0032]/5 p-5"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Up Next</p><h2 className="mt-2 text-2xl font-black">{scheduled.program_family_name}</h2><p className="mt-1 text-sm text-zinc-400">Starts {formatProgramStartDate(scheduled.started_at)} · {assignmentSourceLabel(scheduled)}</p>{scheduled.review_due_at && <p className="mt-2 text-xs font-bold text-zinc-500">{reviewDateStatus(scheduled.review_due_at).label}</p>}</section><section className="rounded-2xl border border-zinc-800 p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Previous Programs</p><div className="mt-4 flex flex-col gap-3">{previous.length ? previous.map((item) => <div key={item.assignment_id} className="rounded-xl bg-zinc-950 p-4"><p className="font-black">{item.program_family_name} <span className="text-xs text-zinc-500">v{item.version_number}</span></p><p className="mt-1 text-xs text-zinc-500">{formatAssignmentDate(item.started_at)} – {item.ended_at ? formatAssignmentDate(item.ended_at) : "Previous"}</p></div>) : <p className="text-sm text-zinc-500">No previous program assignments.</p>}</div></section><div className="grid gap-3 sm:grid-cols-2"><Link href="/programs" className="rounded-xl border border-zinc-700 px-4 py-3 text-center font-black">Browse Programs</Link><Link href="/workouts" className="rounded-xl border border-zinc-700 px-4 py-3 text-center font-black">My Workouts</Link></div></main>;
  if (!active) return null;
  const review = reviewDateStatus(active.review_due_at);

  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
    <header><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">Current Program</p><h1 className="mt-2 text-3xl font-black">{active.program_family_name}</h1><p className="mt-2 text-sm text-zinc-400">v{active.version_number} · {assignmentSourceLabel(active)} · Started {formatAssignmentDate(active.started_at)}</p><p className={`mt-2 text-sm font-bold ${review.isDue ? "text-amber-300" : "text-zinc-500"}`}>{review.label}</p></header>
    {scheduled && <section className="rounded-2xl border border-[#ff0032]/40 bg-[#ff0032]/5 p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff0032]">Up Next</p><h2 className="mt-1 text-xl font-black">{scheduled.program_family_name}</h2><p className="mt-1 text-sm text-zinc-400">Starts {formatProgramStartDate(scheduled.started_at)} · {assignmentSourceLabel(scheduled)}</p>{scheduled.review_due_at && <p className="mt-2 text-xs font-bold text-zinc-500">{reviewDateStatus(scheduled.review_due_at).label}</p>}</section>}
    {message && <p role="alert" className="rounded-xl border border-amber-700/50 p-4 text-sm text-amber-200">{message}</p>}
    {next && next.exercises.length > 0 ? <section className="rounded-3xl border border-[#ff0032]/50 bg-[#ff0032]/5 p-5"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Next Workout</p><h2 className="mt-2 text-2xl font-black">{next.dayName}</h2><p className="mt-1 text-sm text-zinc-400">{next.exercises.length} exercise{next.exercises.length === 1 ? "" : "s"}</p><Link href="/" className="mt-4 inline-flex rounded-xl bg-[#ff0032] px-5 py-3 font-black">Start from Home</Link></section> : <section className="rounded-2xl border border-amber-700/50 p-5"><p className="font-black text-amber-300">Next workout unavailable</p><p className="mt-2 text-sm text-zinc-400">Your assignment is unchanged. Try again before starting a program workout.</p></section>}
    <section><div><p className="text-xs font-black uppercase tracking-[.2em] text-zinc-500">Rotation</p><h2 className="mt-1 text-xl font-black">{rotation.map((day) => day.name).join(" → ")} → repeat</h2></div><div className="mt-4 flex flex-col gap-3">{rotation.map((day) => { const isNext = day.id === next?.dayId; const open = expanded === day.id; return <article key={day.id} className={`rounded-2xl border ${isNext ? "border-[#ff0032] bg-[#ff0032]/5" : "border-zinc-800"}`}><button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : day.id)} className="flex w-full items-center justify-between gap-4 p-4 text-left"><div><p className="font-black">{day.name}</p><p className="mt-1 text-xs text-zinc-500">{day.exercises.length} exercise{day.exercises.length === 1 ? "" : "s"}{isNext ? " · Up next" : ""}</p></div><span aria-hidden="true" className="text-zinc-500">{open ? "−" : "+"}</span></button>{open && <div className="border-t border-zinc-800 px-4 pb-4 pt-2">{day.exercises.length ? day.exercises.map((exercise) => <div key={`${day.id}-${exercise.position}`} className="border-b border-zinc-900 py-3 last:border-0"><div className="flex items-start justify-between gap-4"><p className="font-bold">{exercise.name}</p><p className="text-right text-sm text-zinc-300">{formatPrescriptionTargets(exercise.prescribed_set_targets)}</p></div>{exercise.notes && <p className="mt-1 text-xs leading-5 text-zinc-500">{exercise.notes}</p>}</div>) : <p className="py-3 text-sm text-zinc-400">No prescriptions are available for this workout.</p>}</div>}</article>; })}</div></section>
    <section className="rounded-2xl border border-zinc-800 p-5"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Assignment History</p><h2 className="mt-1 text-lg font-black">Completed assignments stay in your history</h2></div><span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-black">{previous.length}</span></div><div className="mt-4 flex flex-col gap-3">{previous.length ? previous.map((item) => <div key={item.assignment_id} className="rounded-xl bg-zinc-950 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.program_family_name} <span className="text-xs text-zinc-500">v{item.version_number}</span></p><p className="mt-1 text-xs text-zinc-500">{formatAssignmentDate(item.started_at)} – {item.ended_at ? formatAssignmentDate(item.ended_at) : "Previous"}</p><p className="mt-1 text-xs text-zinc-500">{assignmentSourceLabel(item)}</p></div><span className="text-[10px] font-black uppercase text-zinc-500">Previous</span></div></div>) : <p className="text-sm text-zinc-500">No previous program assignments.</p>}</div></section>
    <div className="grid gap-3 sm:grid-cols-2"><Link href="/programs" className="rounded-xl border border-zinc-700 px-4 py-3 text-center font-black">Browse Programs</Link><Link href="/workouts" className="rounded-xl border border-zinc-700 px-4 py-3 text-center font-black">Other Workouts</Link></div>
  </main>;
}
