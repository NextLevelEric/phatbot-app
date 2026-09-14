"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  assignmentSourceLabel,
  buildNextProgramWorkout,
  formatAssignmentDate,
  formatProgramStartDate,
  formatPrescriptionTargets,
  friendlyProgramError,
  minimumFutureProgramStartDate,
  programStartDateInputValue,
  reviewDateStatus,
  type NextProgramWorkout,
  type NextProgramWorkoutRow,
  type ProgramAssignment,
} from "@/features/programs/programUi";

type Family = { id: string; name: string };
type Version = { id: string; program_family_id: string; version_number: number; name: string };
type Choice = Version & { familyName: string };

function dateInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function reviewDateIso(value: string) {
  return value ? new Date(`${value}T12:00:00`).toISOString() : null;
}

export default function CoachAthleteProgramSection({ athleteId }: { athleteId: string }) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<ProgramAssignment[]>([]);
  const [next, setNext] = useState<NextProgramWorkout | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [selectedProgram, setSelectedProgram] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduledProgram, setScheduledProgram] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleReviewDate, setScheduleReviewDate] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const [historyResult, nextResult, familiesResult] = await Promise.all([
      supabase.rpc("get_athlete_program_assignments", { p_athlete_user_id: athleteId }),
      supabase.rpc("get_next_program_workout", { p_athlete_user_id: athleteId }),
      supabase.from("program_families").select("id,name").eq("status", "active").or("source_type.eq.phatbot_stock,source_type.eq.coach").order("name"),
    ]);
    if (historyResult.error || nextResult.error || familiesResult.error) throw new Error("program load failed");
    const assignments = (historyResult.data ?? []) as ProgramAssignment[];
    const active = assignments.find((assignment) => assignment.assignment_status === "active") ?? null;
    const scheduled = assignments.find((assignment) => assignment.assignment_status === "scheduled") ?? null;
    const families = (familiesResult.data ?? []) as Family[];
    const familyIds = families.map((family) => family.id);
    const versionsResult = familyIds.length
      ? await supabase.from("training_programs").select("id,program_family_id,version_number,name").in("program_family_id", familyIds).eq("status", "published").order("version_number", { ascending: false })
      : { data: [], error: null };
    if (versionsResult.error) throw new Error("program load failed");
    const latest = new Map<string, Version>();
    for (const version of (versionsResult.data ?? []) as Version[]) if (!latest.has(version.program_family_id)) latest.set(version.program_family_id, version);
    const available = families.flatMap((family) => {
      const version = latest.get(family.id);
      return version ? [{ ...version, familyName: family.name }] : [];
    });
    setHistory(assignments);
    setNext(buildNextProgramWorkout((nextResult.data ?? []) as NextProgramWorkoutRow[]));
    setChoices(available);
    setSelectedProgram(active?.program_version_id ?? available[0]?.id ?? "");
    setReviewDate(dateInputValue(active?.review_due_at ?? null));
    setScheduledProgram(scheduled?.program_version_id ?? available[0]?.id ?? "");
    setScheduleDate(programStartDateInputValue(scheduled?.started_at ?? null));
    setScheduleReviewDate(dateInputValue(scheduled?.review_due_at ?? null));
    setLoading(false);
  }, [athleteId]);

  useEffect(() => {
    let mounted = true;
    void load().catch(() => {
      if (mounted) { setMessage(friendlyProgramError("load")); setLoading(false); }
    });
    return () => { mounted = false; };
  }, [load]);

  const active = useMemo(() => history.find((assignment) => assignment.assignment_status === "active") ?? null, [history]);
  const scheduled = useMemo(() => history.find((assignment) => assignment.assignment_status === "scheduled") ?? null, [history]);
  const previous = useMemo(() => history.filter((assignment) => assignment.assignment_status === "ended"), [history]);
  const review = reviewDateStatus(active?.review_due_at ?? null);

  async function assignProgram() {
    if (!selectedProgram || working) return;
    const choice = choices.find((item) => item.id === selectedProgram);
    if (!choice) return;
    if (active?.program_version_id !== choice.id && !window.confirm(`Assign ${choice.familyName}?\n\nThe current assignment history will be preserved. The new program starts at its first workout.`)) return;
    setWorking(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = active?.program_version_id === choice.id && active.source_type === "coach_assigned"
      ? await supabase.rpc("set_program_assignment_review_due_at", {
          p_athlete_user_id: athleteId,
          p_review_due_at: reviewDateIso(reviewDate),
        })
      : await supabase.rpc("assign_program_to_athlete", {
          p_athlete_user_id: athleteId,
          p_program_id: choice.id,
          p_source_type: "coach_assigned",
          p_review_due_at: reviewDateIso(reviewDate),
        });
    if (error) { setMessage(friendlyProgramError("assign")); setWorking(false); return; }
    setMessage(`${choice.familyName} is now the athlete's active program.`);
    setShowForm(false);
    await load();
    setWorking(false);
  }

  async function saveReviewDate(value: string) {
    if (!active || working) return;
    setWorking(true);
    setMessage("");
    const { error } = await createSupabaseBrowserClient().rpc("set_program_assignment_review_due_at", {
      p_athlete_user_id: athleteId,
      p_review_due_at: reviewDateIso(value),
    });
    if (error) { setMessage(friendlyProgramError("review")); setWorking(false); return; }
    setMessage(value ? "Program review date saved." : "Program review schedule cleared.");
    await load();
    setWorking(false);
  }

  async function scheduleProgram() {
    if (!scheduledProgram || !scheduleDate || working) return;
    const choice = choices.find((item) => item.id === scheduledProgram);
    if (!choice) return;
    const action = scheduled ? "Update the scheduled program" : "Schedule the next program";
    if (!window.confirm(`${action} to ${choice.familyName} starting ${scheduleDate}?\n\nThe current program and workout rotation remain unchanged until that date.`)) return;
    setWorking(true);
    setMessage("");
    const { error } = await createSupabaseBrowserClient().rpc("schedule_program_for_athlete", {
      p_athlete_user_id: athleteId,
      p_program_id: choice.id,
      p_starts_on: scheduleDate,
      p_review_due_at: reviewDateIso(scheduleReviewDate),
    });
    if (error) { setMessage(friendlyProgramError("schedule")); setWorking(false); return; }
    setMessage(`${choice.familyName} is scheduled to start ${formatProgramStartDate(`${scheduleDate}T12:00:00Z`)}.`);
    setShowScheduleForm(false);
    await load();
    setWorking(false);
  }

  async function cancelScheduledProgram() {
    if (!scheduled || working || !window.confirm(`Cancel ${scheduled.program_family_name}'s scheduled start?\n\nThe current program will remain unchanged.`)) return;
    setWorking(true);
    setMessage("");
    const { error } = await createSupabaseBrowserClient().rpc("cancel_scheduled_program_for_athlete", {
      p_athlete_user_id: athleteId,
    });
    if (error) { setMessage(friendlyProgramError("cancelSchedule")); setWorking(false); return; }
    setMessage("Scheduled program canceled. The current program is unchanged.");
    setShowScheduleForm(false);
    await load();
    setWorking(false);
  }

  if (loading) return <section className="rounded-2xl border border-zinc-800 p-5"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Program</p><p className="mt-2 text-sm text-zinc-400">Loading assignment...</p></section>;

  return <section className="rounded-2xl border border-zinc-800 p-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Current Program</p><h2 className="mt-1 text-xl font-black">{active ? `${active.program_family_name} v${active.version_number}` : "No program assigned"}</h2>{active && <><p className="mt-1 text-sm text-zinc-400">{assignmentSourceLabel(active)} · Assigned {formatAssignmentDate(active.started_at)}</p><p className={`mt-2 text-sm font-bold ${review.isDue ? "text-amber-300" : "text-zinc-500"}`}>{review.label}</p></>}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowForm((value) => !value)} className="rounded-xl bg-[#ff0032] px-4 py-3 text-sm font-black text-white">{active ? "Change Current Program" : "Assign Current Program"}</button><button type="button" onClick={() => setShowScheduleForm((value) => !value)} className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-black">{scheduled ? "Change Scheduled Program" : "Schedule Next Program"}</button></div></div>
    {active && <div className="mt-4 rounded-xl bg-zinc-950 p-4"><p className="text-[11px] font-black uppercase tracking-[.16em] text-zinc-500">Next workout</p><p className="mt-1 font-black">{next?.dayName ?? "Next workout unavailable"}</p>{next && <p className="mt-1 text-sm text-zinc-400">{next.exercises.length} exercise{next.exercises.length === 1 ? "" : "s"}</p>}<details className="mt-3"><summary className="cursor-pointer text-sm font-black text-zinc-300">View prescriptions</summary><div className="mt-2">{next?.exercises.map((exercise) => <div key={`${exercise.position}-${exercise.name}`} className="flex items-start justify-between gap-4 border-t border-zinc-900 py-2 text-sm"><span>{exercise.name}</span><span className="text-right text-zinc-500">{formatPrescriptionTargets(exercise.targets)}</span></div>)}</div></details></div>}
    {scheduled && <div className="mt-4 rounded-xl border border-[#ff0032]/40 bg-[#ff0032]/5 p-4"><p className="text-[11px] font-black uppercase tracking-[.16em] text-[#ff0032]">Up Next</p><p className="mt-1 font-black">{scheduled.program_family_name} <span className="text-xs text-zinc-500">v{scheduled.version_number}</span></p><p className="mt-1 text-sm text-zinc-400">Starts {formatProgramStartDate(scheduled.started_at)}</p><p className="mt-1 text-xs text-zinc-500">{scheduled.review_due_at ? reviewDateStatus(scheduled.review_due_at).label : "No review scheduled"}</p></div>}
    {active && <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><label><span className="text-xs font-bold text-zinc-500">Review date</span><input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3"/></label><button type="button" disabled={working} onClick={() => void saveReviewDate(reviewDate)} className="self-end rounded-xl border border-zinc-700 px-4 py-3 text-sm font-black disabled:opacity-50">Save Date</button><button type="button" disabled={working || !active.review_due_at} onClick={() => { setReviewDate(""); void saveReviewDate(""); }} className="self-end rounded-xl border border-zinc-800 px-4 py-3 text-sm font-black text-zinc-400 disabled:opacity-40">No Review</button></div>}
    {showForm && <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4"><label className="block text-sm font-bold">Published program<select value={selectedProgram} onChange={(event) => setSelectedProgram(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3"><option value="">Select a program</option>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.familyName} · v{choice.version_number}</option>)}</select></label><label className="mt-3 block text-sm font-bold">Optional review date<input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3"/></label><p className="mt-3 text-xs leading-5 text-zinc-500">Changing programs preserves assignment history and starts the new rotation at its first workout.</p><button type="button" disabled={!selectedProgram || working} onClick={() => void assignProgram()} className="mt-4 w-full rounded-xl bg-white px-4 py-3 font-black text-black disabled:opacity-50">{working ? "Saving..." : active ? "Confirm Program" : "Assign Program"}</button></div>}
    {showScheduleForm && <div className="mt-4 rounded-xl border border-[#ff0032]/30 bg-zinc-950 p-4"><p className="text-xs font-black uppercase tracking-[.16em] text-[#ff0032]">{scheduled ? "Update Upcoming Program" : "Schedule Next Program"}</p><label className="mt-3 block text-sm font-bold">Published program<select value={scheduledProgram} onChange={(event) => setScheduledProgram(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3"><option value="">Select a program</option>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.familyName} · v{choice.version_number}</option>)}</select></label><label className="mt-3 block text-sm font-bold">Start date<input type="date" min={minimumFutureProgramStartDate()} value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3"/></label><label className="mt-3 block text-sm font-bold">Optional review date<input type="date" value={scheduleReviewDate} onChange={(event) => setScheduleReviewDate(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3"/></label><p className="mt-3 text-xs leading-5 text-zinc-500">The current program and rotation remain authoritative until midnight Eastern on the selected date.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" disabled={!scheduledProgram || !scheduleDate || working} onClick={() => void scheduleProgram()} className="rounded-xl bg-white px-4 py-3 font-black text-black disabled:opacity-50">{working ? "Saving..." : scheduled ? "Update Schedule" : "Confirm Schedule"}</button>{scheduled && <button type="button" disabled={working} onClick={() => void cancelScheduledProgram()} className="rounded-xl border border-red-900 px-4 py-3 font-black text-red-300 disabled:opacity-50">Cancel Scheduled Change</button>}</div></div>}
    {message && <p role="status" className="mt-4 rounded-xl border border-zinc-800 p-3 text-sm text-zinc-300">{message}</p>}
    {previous.length > 0 && <div className="mt-4"><button type="button" onClick={() => setShowHistory((value) => !value)} className="text-sm font-black text-zinc-300">{showHistory ? "Hide History" : "View History"} →</button>{showHistory && <div className="mt-3 flex flex-col gap-2">{previous.map((item) => <div key={item.assignment_id} className="rounded-xl bg-zinc-950 p-3"><p className="font-bold">{item.program_family_name} <span className="text-xs text-zinc-500">v{item.version_number}</span></p><p className="mt-1 text-xs text-zinc-500">{formatAssignmentDate(item.started_at)} – {item.ended_at ? formatAssignmentDate(item.ended_at) : "Previous"} · {assignmentSourceLabel(item)}</p></div>)}</div>}</div>}
  </section>;
}
