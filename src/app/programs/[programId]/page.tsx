"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  formatPrescriptionTargets,
  formatProgramStartDate,
  friendlyProgramError,
  type ProgramAssignment,
} from "@/features/programs/programUi";
import { stockCatalogDescription } from "@/features/programs/stockCatalog";

type Program = {
  id: string;
  name: string;
  description: string | null;
  version_number: number;
  program_families: {
    name: string;
    slug: string;
    source_type: string;
    visibility: string;
    status: string;
  } | Array<{
    name: string;
    slug: string;
    source_type: string;
    visibility: string;
    status: string;
  }>;
};
type Day = { id: string; program_id: string; day_number: number; name: string };
type Prescription = { program_day_id: string; exercise_id: string; position: number; prescribed_set_targets: string[]; notes: string | null };
type Exercise = { id: string; name: string };
type PreviewDay = Day & { exercises: Array<Prescription & { name: string }> };

export default function ProgramPreviewPage() {
  const { programId } = useParams<{ programId: string }>();
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<Program | null>(null);
  const [days, setDays] = useState<PreviewDay[]>([]);
  const [active, setActive] = useState<ProgramAssignment | null>(null);
  const [scheduled, setScheduled] = useState<ProgramAssignment | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const [programResult, assignmentsResult] = await Promise.all([
        supabase.from("training_programs")
          .select("id,name,description,version_number,program_families!inner(name,slug,source_type,visibility,status)")
          .eq("id", programId)
          .eq("status", "published")
          .eq("program_families.source_type", "phatbot_stock")
          .eq("program_families.visibility", "stock_catalog")
          .eq("program_families.status", "active")
          .maybeSingle(),
        supabase.rpc("get_athlete_program_assignments", { p_athlete_user_id: user.id }),
      ]);
      if (!mounted) return;
      setUserId(user.id);
      if (programResult.error || assignmentsResult.error || !programResult.data) {
        setMessage(friendlyProgramError("load"));
        setLoading(false);
        return;
      }
      const loadedProgram = programResult.data as unknown as Program;
      const history = (assignmentsResult.data ?? []) as ProgramAssignment[];
      setProgram(loadedProgram);
      setActive(history.find((assignment) => assignment.assignment_status === "active") ?? null);
      setScheduled(history.find((assignment) => assignment.assignment_status === "scheduled") ?? null);

      const daysResult = await supabase.from("training_program_days")
        .select("id,program_id,day_number,name")
        .eq("program_id", programId)
        .order("day_number");
      if (!mounted) return;
      if (daysResult.error) { setMessage(friendlyProgramError("load")); setLoading(false); return; }
      const loadedDays = (daysResult.data ?? []) as Day[];
      const dayIds = loadedDays.map((day) => day.id);
      const prescriptionsResult = dayIds.length
        ? await supabase.from("training_program_exercises")
          .select("program_day_id,exercise_id,position,prescribed_set_targets,notes")
          .in("program_day_id", dayIds)
          .order("position")
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
      const exerciseNames = new Map(((exercisesResult.data ?? []) as Exercise[]).map((exercise) => [exercise.id, exercise.name]));
      setDays(loadedDays.map((day) => ({
        ...day,
        exercises: prescriptions
          .filter((item) => item.program_day_id === day.id)
          .map((item) => ({ ...item, name: exerciseNames.get(item.exercise_id) ?? "Exercise" })),
      })));
      setExpanded(loadedDays[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [programId]);

  async function selectProgram() {
    if (!program || !userId || selecting || active?.program_version_id === program.id) return;
    const family = Array.isArray(program.program_families) ? program.program_families[0] : program.program_families;
    const targetName = family?.name || program.name;
    if (active) {
      const scheduledNotice = scheduled
        ? `\n\nYour scheduled ${scheduled.program_family_name} assignment for ${formatProgramStartDate(scheduled.started_at)} will remain scheduled.`
        : "";
      const confirmed = window.confirm(`Switch programs?\n\nYou're currently training: ${active.program_family_name}.\n\nSwitching will end your current program assignment and start: ${targetName}.\n\nYour workout history will be preserved.${scheduledNotice}`);
      if (!confirmed) return;
    }
    setSelecting(true);
    setMessage("");
    const { error } = await createSupabaseBrowserClient().rpc("assign_program_to_athlete", {
      p_athlete_user_id: userId,
      p_program_id: program.id,
      p_source_type: "athlete_selected",
    });
    if (error) {
      setMessage(friendlyProgramError("assign"));
      setSelecting(false);
      return;
    }
    window.location.href = "/programs/current";
  }

  if (loading) return <main className="mx-auto min-h-screen max-w-3xl px-5 py-10"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Program Preview</p><h1 className="mt-2 text-3xl font-black">Loading the rotation...</h1></main>;
  if (!program) return <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-10"><section className="rounded-3xl border border-amber-700/50 p-6"><p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">Program unavailable</p><h1 className="mt-2 text-2xl font-black">This program could not be loaded.</h1><p className="mt-3 text-sm text-zinc-400">{message || "It may no longer be part of the published PHATBOT catalog."}</p><Link href="/programs" className="mt-5 inline-flex rounded-xl bg-white px-4 py-3 font-black text-black">Back to Programs</Link></section></main>;

  const family = Array.isArray(program.program_families) ? program.program_families[0] : program.program_families;
  const programName = family?.name || program.name;
  const current = active?.program_version_id === program.id;
  const description = stockCatalogDescription({ familySlug: family?.slug ?? "", description: program.description });

  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
    <Link href="/programs" className="text-sm font-black text-zinc-400">← Browse Programs</Link>
    <header className="rounded-3xl border border-[#ff0032]/40 bg-gradient-to-br from-zinc-900 via-black to-[#210007] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Program</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{programName}</h1><p className="mt-2 text-xs font-bold text-zinc-500">v{program.version_number} · {days.length}-workout rotation</p>{description && <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">{description}</p>}</header>
    {scheduled && <section className="rounded-2xl border border-[#ff0032]/40 bg-[#ff0032]/5 p-4"><p className="text-xs font-black uppercase tracking-[.16em] text-[#ff0032]">Up Next remains scheduled</p><p className="mt-2 font-black">{scheduled.program_family_name}</p><p className="mt-1 text-sm text-zinc-400">Starts {formatProgramStartDate(scheduled.started_at)}. Previewing or choosing a current program will not cancel it.</p></section>}
    <section><p className="text-xs font-black uppercase tracking-[.2em] text-zinc-500">Rotation & prescriptions</p><h2 className="mt-1 text-xl font-black">{days.map((day) => day.name).join(" → ")} → repeat</h2><div className="mt-4 flex flex-col gap-3">{days.map((day) => { const open = expanded === day.id; return <article key={day.id} className="rounded-2xl border border-zinc-800 bg-zinc-950"><button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : day.id)} className="flex w-full items-center justify-between gap-4 p-4 text-left"><div><p className="font-black">Day {day.day_number} · {day.name}</p><p className="mt-1 text-xs text-zinc-500">{day.exercises.length} exercise{day.exercises.length === 1 ? "" : "s"}</p></div><span aria-hidden="true" className="text-zinc-500">{open ? "−" : "+"}</span></button>{open && <div className="border-t border-zinc-800 px-4 pb-4 pt-2">{day.exercises.map((exercise) => <div key={`${day.id}-${exercise.position}`} className="border-b border-zinc-900 py-3 last:border-0"><div className="flex items-start justify-between gap-4"><p className="font-bold">{exercise.name}</p><p className="text-right text-sm text-zinc-300">{formatPrescriptionTargets(exercise.prescribed_set_targets)}</p></div>{exercise.notes && <p className="mt-1 text-xs leading-5 text-zinc-500">{exercise.notes}</p>}</div>)}</div>}</article>; })}</div></section>
    {message && <p role="alert" className="rounded-xl border border-amber-700/50 bg-amber-950/10 p-4 text-sm text-amber-200">{message}</p>}
    <section className="sticky bottom-4 rounded-3xl border border-zinc-800 bg-black/95 p-4 shadow-2xl backdrop-blur sm:static"><button type="button" onClick={() => void selectProgram()} disabled={current || selecting} className="w-full rounded-2xl bg-[#ff0032] px-5 py-4 font-black text-white disabled:bg-zinc-800 disabled:text-zinc-500">{current ? "Current Program" : selecting ? "Starting Program..." : active ? "Switch Program" : "Start This Program"}</button><Link href="/workouts" className="mt-3 block text-center text-sm font-black text-zinc-400">Keep using my own workouts</Link></section>
  </main>;
}
