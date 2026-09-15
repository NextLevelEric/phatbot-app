"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  formatProgramStartDate,
  friendlyProgramError,
  type ProgramAssignment,
} from "@/features/programs/programUi";
import {
  isFeaturedProgram,
  selectCurrentProgramLaunch,
  type ProgramLaunchRow,
  type VisibleProgramLaunch,
} from "@/features/programs/programLaunch";
import {
  buildStockCatalog,
  stockCatalogDescription,
  type StockCatalogDayRow,
  type StockCatalogProgram,
  type StockCatalogVersionRow,
} from "@/features/programs/stockCatalog";

export default function ProgramsPage() {
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<StockCatalogProgram[]>([]);
  const [active, setActive] = useState<ProgramAssignment | null>(null);
  const [scheduled, setScheduled] = useState<ProgramAssignment | null>(null);
  const [launch, setLaunch] = useState<VisibleProgramLaunch | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const now = new Date();
      const [versionsResult, assignmentsResult, launchesResult] = await Promise.all([
        supabase.from("training_programs")
          .select("id,program_family_id,name,description,version_number,program_families!inner(id,name,slug,source_type,visibility,status)")
          .eq("status", "published")
          .eq("program_families.source_type", "phatbot_stock")
          .eq("program_families.visibility", "stock_catalog")
          .eq("program_families.status", "active")
          .order("version_number", { ascending: false }),
        supabase.rpc("get_athlete_program_assignments", { p_athlete_user_id: user.id }),
        supabase.from("program_launches")
          .select("id,program_id,launch_at,status,headline,summary")
          .eq("status", "active")
          .lte("launch_at", now.toISOString())
          .order("launch_at", { ascending: false })
          .limit(1),
      ]);
      if (!mounted) return;
      if (versionsResult.error || assignmentsResult.error) {
        setMessage(friendlyProgramError("load"));
        setLoading(false);
        return;
      }
      const versions = (versionsResult.data ?? []) as unknown as StockCatalogVersionRow[];
      const versionIds = versions.map((version) => version.id);
      const daysResult = versionIds.length
        ? await supabase.from("training_program_days").select("id,program_id,day_number,name").in("program_id", versionIds).order("day_number")
        : { data: [], error: null };
      if (!mounted) return;
      if (daysResult.error) { setMessage(friendlyProgramError("load")); setLoading(false); return; }
      setPrograms(buildStockCatalog(versions, (daysResult.data ?? []) as StockCatalogDayRow[]));
      const history = (assignmentsResult.data ?? []) as ProgramAssignment[];
      setActive(history.find((assignment) => assignment.assignment_status === "active") ?? null);
      setScheduled(history.find((assignment) => assignment.assignment_status === "scheduled") ?? null);
      setLaunch(launchesResult.error
        ? null
        : selectCurrentProgramLaunch((launchesResult.data ?? []) as ProgramLaunchRow[], now));
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <main className="mx-auto min-h-screen max-w-3xl px-5 py-10"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Programs</p><h1 className="mt-2 text-3xl font-black">Loading the PHATBOT catalog...</h1></main>;

  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
    <header><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Programs</p><h1 className="mt-2 text-3xl font-black">Choose your rotation</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Programs guide what comes next without taking away your custom workouts.</p></header>
    {active && <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs font-black uppercase tracking-[.16em] text-zinc-500">Current program</p><div className="mt-2 flex items-center justify-between gap-4"><div><p className="font-black">{active.program_family_name} <span className="text-xs text-zinc-500">v{active.version_number}</span></p>{active.source_type === "coach_assigned" && <p className="mt-1 text-sm text-zinc-400">Assigned by {active.assigned_by_display_name?.trim() || "your coach"}. You can still choose another program when it fits your training.</p>}</div><Link href="/programs/current" className="shrink-0 text-sm font-black">View →</Link></div></section>}
    {scheduled && <section className="rounded-2xl border border-[#ff0032]/40 bg-[#ff0032]/5 p-4"><p className="text-xs font-black uppercase tracking-[.16em] text-[#ff0032]">Up Next</p><p className="mt-2 font-black">{scheduled.program_family_name}</p><p className="mt-1 text-sm text-zinc-400">Starts {formatProgramStartDate(scheduled.started_at)}. Browsing or switching your current program will not cancel this scheduled assignment.</p></section>}
    {message && <p role="alert" className="rounded-xl border border-amber-700/50 bg-amber-950/10 p-4 text-sm text-amber-200">{message}</p>}
    <section className="grid gap-4 sm:grid-cols-2">
      {programs.map((program) => {
        const current = active?.program_version_id === program.id;
        const featured = isFeaturedProgram(program.id, launch);
        const description = stockCatalogDescription(program);
        return <article key={program.id} className={`rounded-3xl border p-5 ${current ? "border-[#ff0032] bg-[#ff0032]/5" : featured ? "border-[#ff0032]/60 bg-gradient-to-b from-[#1b0006] to-zinc-950" : "border-zinc-800 bg-zinc-950"}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">{program.familyName}</h2>{featured && <span className="rounded-full bg-[#ff0032] px-2.5 py-1 text-[9px] font-black uppercase tracking-[.12em] text-white">Featured</span>}</div><p className="mt-1 text-xs text-zinc-500">v{program.version_number} · {program.days.length}-workout rotation</p></div>{current && <span className="rounded-full border border-[#ff0032]/50 px-3 py-1 text-[10px] font-black uppercase text-[#ff0032]">Current</span>}</div>{description && <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>}<div className="mt-4 flex flex-wrap gap-2">{program.days.map((day) => <span key={day.id} className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-300">{day.name}</span>)}</div><Link href={`/programs/${program.id}`} className={`mt-5 block w-full rounded-xl px-4 py-3 text-center font-black ${current ? "border border-zinc-700 text-zinc-200" : "bg-white text-black"}`}>{current ? "View Current Program" : active ? "View Before Switching" : "View Program"}</Link></article>;
      })}
      {!programs.length && <p className="rounded-2xl border border-dashed border-zinc-700 p-6 text-zinc-400">No published PHATBOT programs are available right now.</p>}
    </section>
    <Link href="/workouts" className="text-center text-sm font-black text-zinc-400">Use or create my own workouts →</Link>
  </main>;
}
