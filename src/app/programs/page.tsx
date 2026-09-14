"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { friendlyProgramError, type ProgramAssignment } from "@/features/programs/programUi";

type Family = { id: string; name: string; slug: string };
type Version = { id: string; program_family_id: string; name: string; description: string | null; version_number: number };
type Day = { id: string; program_id: string; day_number: number; name: string };
type CatalogProgram = Version & { familyName: string; days: Day[] };

export default function ProgramsPage() {
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);
  const [active, setActive] = useState<ProgramAssignment | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const [familiesResult, assignmentsResult] = await Promise.all([
        supabase.from("program_families").select("id,name,slug").eq("source_type", "phatbot_stock").eq("visibility", "stock_catalog").eq("status", "active").order("name"),
        supabase.rpc("get_athlete_program_assignments", { p_athlete_user_id: user.id }),
      ]);
      if (!mounted) return;
      setUserId(user.id);
      if (familiesResult.error || assignmentsResult.error) {
        setMessage(friendlyProgramError("load"));
        setLoading(false);
        return;
      }
      const families = (familiesResult.data ?? []) as Family[];
      const familyIds = families.map((family) => family.id);
      const versionsResult = familyIds.length
        ? await supabase.from("training_programs").select("id,program_family_id,name,description,version_number").in("program_family_id", familyIds).eq("status", "published").order("version_number", { ascending: false })
        : { data: [], error: null };
      if (!mounted) return;
      if (versionsResult.error) { setMessage(friendlyProgramError("load")); setLoading(false); return; }
      const latest = new Map<string, Version>();
      for (const version of (versionsResult.data ?? []) as Version[]) if (!latest.has(version.program_family_id)) latest.set(version.program_family_id, version);
      const versionIds = [...latest.values()].map((version) => version.id);
      const daysResult = versionIds.length
        ? await supabase.from("training_program_days").select("id,program_id,day_number,name").in("program_id", versionIds).order("day_number")
        : { data: [], error: null };
      if (!mounted) return;
      if (daysResult.error) { setMessage(friendlyProgramError("load")); setLoading(false); return; }
      const days = (daysResult.data ?? []) as Day[];
      setPrograms(families.flatMap((family) => {
        const version = latest.get(family.id);
        return version ? [{ ...version, familyName: family.name, days: days.filter((day) => day.program_id === version.id) }] : [];
      }));
      const history = (assignmentsResult.data ?? []) as ProgramAssignment[];
      setActive(history.find((assignment) => assignment.assignment_status === "active") ?? null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  async function choose(program: CatalogProgram) {
    if (!userId || selecting || active?.program_version_id === program.id || active?.source_type === "coach_assigned") return;
    if (active && !window.confirm(`Switch to ${program.familyName}?\n\nYour current program history will be preserved. Your new program starts at its first workout.`)) return;
    setSelecting(program.id);
    setMessage("");
    const { error } = await createSupabaseBrowserClient().rpc("assign_program_to_athlete", {
      p_athlete_user_id: userId,
      p_program_id: program.id,
      p_source_type: "athlete_selected",
    });
    if (error) {
      setMessage(friendlyProgramError("assign"));
      setSelecting(null);
      return;
    }
    window.location.href = "/programs/current";
  }

  if (loading) return <main className="mx-auto min-h-screen max-w-3xl px-5 py-10"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Programs</p><h1 className="mt-2 text-3xl font-black">Loading the PHATBOT catalog...</h1></main>;

  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
    <header><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Programs</p><h1 className="mt-2 text-3xl font-black">Choose your rotation</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Programs guide what comes next without taking away your custom workouts.</p></header>
    {active && <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs font-black uppercase tracking-[.16em] text-zinc-500">Current program</p><div className="mt-2 flex items-center justify-between gap-4"><div><p className="font-black">{active.program_family_name} <span className="text-xs text-zinc-500">v{active.version_number}</span></p>{active.source_type === "coach_assigned" && <p className="mt-1 text-sm text-zinc-400">Your coach assigned this program. Contact them before changing it.</p>}</div><Link href="/programs/current" className="shrink-0 text-sm font-black">View →</Link></div></section>}
    {message && <p role="alert" className="rounded-xl border border-amber-700/50 bg-amber-950/10 p-4 text-sm text-amber-200">{message}</p>}
    {active?.source_type === "coach_assigned" && <p className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400">Coach-assigned programming is treated as authoritative in V1. You can browse the catalog, but program changes remain with your coach.</p>}
    <section className="grid gap-4 sm:grid-cols-2">
      {programs.map((program) => {
        const current = active?.program_version_id === program.id;
        const blocked = active?.source_type === "coach_assigned";
        return <article key={program.id} className={`rounded-3xl border p-5 ${current ? "border-[#ff0032] bg-[#ff0032]/5" : "border-zinc-800 bg-zinc-950"}`}><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{program.familyName}</h2><p className="mt-1 text-xs text-zinc-500">v{program.version_number} · {program.days.length}-workout rotation</p></div>{current && <span className="rounded-full border border-[#ff0032]/50 px-3 py-1 text-[10px] font-black uppercase text-[#ff0032]">Current</span>}</div>{program.description && <p className="mt-3 text-sm leading-6 text-zinc-400">{program.description}</p>}<div className="mt-4 flex flex-wrap gap-2">{program.days.map((day) => <span key={day.id} className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-300">{day.name}</span>)}</div><button type="button" onClick={() => void choose(program)} disabled={current || blocked || selecting !== null} className="mt-5 w-full rounded-xl bg-white px-4 py-3 font-black text-black disabled:bg-zinc-800 disabled:text-zinc-500">{current ? "Current Program" : blocked ? "Coach Managed" : selecting === program.id ? "Selecting..." : active ? "Switch to This Program" : "Choose This Program"}</button></article>;
      })}
      {!programs.length && <p className="rounded-2xl border border-dashed border-zinc-700 p-6 text-zinc-400">No published PHATBOT programs are available right now.</p>}
    </section>
    <Link href="/workouts" className="text-center text-sm font-black text-zinc-400">Use or create my own workouts →</Link>
  </main>;
}
