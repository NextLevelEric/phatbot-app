"use client";

import { rebuildCoachingMessage } from "@/features/coaching/rebuildProgress";

type RebuildStage = "rebuild_started" | "baseline_established" | "rebuilding_progress" | "plateau_cleared";

type Props = {
  exerciseName: string;
  hasPreviousPerformance: boolean;
  plateauSessions?: number | null;
  rebuild?: {
    stage: RebuildStage;
    progressFromRebuildPercent: number | null;
    recoveryToPreRebuildPercent: number | null;
  } | null;
};

export function LiveExerciseCoachingCard({ exerciseName, hasPreviousPerformance, plateauSessions, rebuild }: Props) {
  if (rebuild && rebuild.stage !== "plateau_cleared") {
    const message = rebuildCoachingMessage({ stage: rebuild.stage, exerciseName, progressPercent: rebuild.progressFromRebuildPercent });
    return <div className="mt-4 rounded-xl border border-[#ff0032]/45 bg-[#ff0032]/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">PHATBOT COACHING NOTE</p>
        <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-300">Rebuild Active</span>
      </div>
      <p className="mt-2 font-bold">{message.headline}</p>
      <p className="mt-1 text-sm leading-6 text-zinc-300">{message.body}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-black/30 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">From Rebuild</p><p className="mt-1 font-black">{rebuild.progressFromRebuildPercent !== null ? `${rebuild.progressFromRebuildPercent >= 0 ? "+" : ""}${rebuild.progressFromRebuildPercent.toFixed(1)}%` : "—"}</p></div>
        <div className="rounded-lg bg-black/30 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Vs Pre-Rebuild</p><p className="mt-1 font-black">{rebuild.recoveryToPreRebuildPercent !== null ? `${rebuild.recoveryToPreRebuildPercent >= 0 ? "+" : ""}${rebuild.recoveryToPreRebuildPercent.toFixed(1)}%` : "—"}</p></div>
      </div>
      <p className="mt-3 text-xs font-semibold text-zinc-200">Today’s mission: clean, controlled progress from the rebuild baseline. Don’t rush the old load just to chase a number.</p>
    </div>;
  }

  if (plateauSessions && plateauSessions >= 3) return <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/60 p-4"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">PHATBOT COACHING NOTE</p><p className="mt-2 font-bold">PHATBOT has been watching this one.</p><p className="mt-1 text-sm leading-6 text-zinc-300">{exerciseName} has been flat for {plateauSessions} sessions. Review the recommendation below before you chase the same numbers again.</p></div>;

  if (hasPreviousPerformance) return <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs font-black uppercase tracking-[.2em] text-zinc-500">PHATBOT TARGET</p><p className="mt-2 text-sm font-semibold text-zinc-200">You have history here. Beat the corresponding previous set and PHATBOT will mark the win immediately.</p></div>;

  return <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs font-black uppercase tracking-[.2em] text-zinc-500">PHATBOT BASELINE</p><p className="mt-2 text-sm font-semibold text-zinc-200">No previous performance detected. Train clean today. PHATBOT will use this session as the baseline to beat next time.</p></div>;
}
