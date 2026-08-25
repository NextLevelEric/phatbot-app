"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Stage = "rebuild_started" | "baseline_established" | "rebuilding_progress" | "plateau_cleared";
type RebuildRow = {
  exercise_id: string;
  exercise_name: string;
  stage: Stage;
  progress_from_rebuild_percent: number | null;
  recovery_to_pre_rebuild_percent: number | null;
  post_rebuild_sessions: number;
};

const stageLabel: Record<Stage, string> = {
  rebuild_started: "REBUILD STARTED",
  baseline_established: "BASELINE ESTABLISHED",
  rebuilding_progress: "REBUILDING",
  plateau_cleared: "PLATEAU CLEARED",
};

function signedPercent(value: number | null) {
  if (value === null) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function homeSummary(row: RebuildRow) {
  if (row.stage === "rebuild_started") {
    return "Deliberate reset underway. Clean reps first, then build the load back up.";
  }
  if (row.stage === "baseline_established") {
    return "Rebuild baseline established. PHATBOT is watching the next sessions for repeatable progress.";
  }
  if (row.stage === "rebuilding_progress") {
    if (row.post_rebuild_sessions < 2) {
      return "Progress is improving. PHATBOT is waiting for one more confirming session.";
    }
    return "Progress is moving in the right direction. Keep repeating clean, productive work.";
  }
  return "The rebuild has cleared.";
}

export function RebuildDashboardStatus() {
  const [rows, setRows] = useState<RebuildRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data, error } = await supabase
        .from("exercise_rebuild_progress")
        .select("exercise_id,exercise_name,stage,progress_from_rebuild_percent,recovery_to_pre_rebuild_percent,post_rebuild_sessions,updated_at")
        .eq("athlete_user_id", user.id)
        .neq("stage", "plateau_cleared")
        .order("updated_at", { ascending: false })
        .limit(3);
      if (!error && !cancelled) setRows((data ?? []) as RebuildRow[]);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (!rows.length) return null;

  return <section className="flex flex-col gap-3">
    <div>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff0032]">Active PHATBOT Coaching</p>
      <h2 className="mt-1 text-xl font-bold">Rebuilds in progress</h2>
    </div>
    {rows.map((row) => {
      const hasMeaningfulProgress = row.post_rebuild_sessions > 0 && row.progress_from_rebuild_percent !== null && Math.abs(row.progress_from_rebuild_percent) >= 0.05;
      const progress = hasMeaningfulProgress ? signedPercent(row.progress_from_rebuild_percent) : null;
      return <Link key={row.exercise_id} href={`/progress/exercises?exercise=${encodeURIComponent(row.exercise_id)}`} className="rounded-2xl border border-zinc-700 p-5 transition hover:border-[#ff0032]/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Coaching Intervention</p>
            <p className="mt-2 text-lg font-bold">{row.exercise_name}</p>
          </div>
          <span className="shrink-0 rounded-full bg-[#ff0032]/10 px-3 py-1 text-[10px] font-black tracking-wider text-[#ff0032]">{stageLabel[row.stage]}</span>
        </div>
        {progress && <p className="mt-3 text-sm font-bold text-white">{progress} from rebuild baseline</p>}
        <p className={`${progress ? "mt-1" : "mt-3"} text-sm leading-6 text-zinc-300`}>{homeSummary(row)}</p>
        <p className="mt-3 text-sm font-semibold">Review exercise →</p>
      </Link>;
    })}
  </section>;
}
