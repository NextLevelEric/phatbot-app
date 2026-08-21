"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { rebuildCoachingMessage } from "@/features/coaching/rebuildProgress";

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
      const message = rebuildCoachingMessage({ stage: row.stage, exerciseName: row.exercise_name, progressPercent: row.progress_from_rebuild_percent });
      return <Link key={row.exercise_id} href={`/progress/exercises?exercise=${encodeURIComponent(row.exercise_id)}`} className="rounded-2xl border border-zinc-700 p-5 transition hover:border-[#ff0032]/60">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Coaching Intervention</p><p className="mt-2 text-lg font-bold">{row.exercise_name}</p></div>
          <span className="rounded-full bg-[#ff0032]/10 px-3 py-1 text-[10px] font-black tracking-wider text-[#ff0032]">{stageLabel[row.stage]}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-300">{message.body}</p>
        {row.post_rebuild_sessions > 0 && <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-zinc-400"><span>From rebuild: {row.progress_from_rebuild_percent !== null ? `${row.progress_from_rebuild_percent >= 0 ? "+" : ""}${row.progress_from_rebuild_percent.toFixed(1)}%` : "—"}</span><span>Vs pre-rebuild: {row.recovery_to_pre_rebuild_percent !== null ? `${row.recovery_to_pre_rebuild_percent >= 0 ? "+" : ""}${row.recovery_to_pre_rebuild_percent.toFixed(1)}%` : "—"}</span></div>}
        <p className="mt-3 text-sm font-semibold">Review exercise →</p>
      </Link>;
    })}
  </section>;
}
