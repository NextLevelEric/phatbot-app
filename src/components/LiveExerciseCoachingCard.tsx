"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { rebuildCoachingMessage } from "@/features/coaching/rebuildProgress";

type RebuildStage = "rebuild_started" | "baseline_established" | "rebuilding_progress" | "plateau_cleared";

type RebuildSignal = {
  stage: RebuildStage;
  progressFromRebuildPercent: number | null;
  recoveryToPreRebuildPercent: number | null;
  postRebuildSessions: number;
};

type Props = {
  exerciseName: string;
  hasPreviousPerformance: boolean;
  plateauSessions?: number | null;
  rebuild?: {
    stage: RebuildStage;
    progressFromRebuildPercent: number | null;
    recoveryToPreRebuildPercent: number | null;
    postRebuildSessions?: number | null;
  } | null;
};

function missionFor(rebuild: RebuildSignal) {
  if (rebuild.stage === "rebuild_started") {
    return "Today’s mission: repeat the rebuild load with clean reps. Add reps before you rush the old load.";
  }
  if (rebuild.stage === "baseline_established") {
    return "Today’s mission: match or beat the clean rebuild baseline. One controlled win is enough.";
  }
  if (rebuild.recoveryToPreRebuildPercent !== null && rebuild.recoveryToPreRebuildPercent >= -5) {
    return "Today’s mission: you’re close to the old strength signal. A small load increase is reasonable if you can still own at least 3 clean reps.";
  }
  if (rebuild.progressFromRebuildPercent !== null && rebuild.progressFromRebuildPercent >= 1) {
    return "Today’s mission: keep building from the rebuild baseline. Add a rep or a small amount of load without sacrificing control.";
  }
  return "Today’s mission: clean, controlled progress from the rebuild baseline. Don’t rush the old load just to chase a number.";
}

export function LiveExerciseCoachingCard({ exerciseName, hasPreviousPerformance, plateauSessions, rebuild }: Props) {
  const [persistedRebuild, setPersistedRebuild] = useState<RebuildSignal | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRebuild() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data, error } = await supabase
        .from("exercise_rebuild_progress")
        .select("stage,progress_from_rebuild_percent,recovery_to_pre_rebuild_percent,post_rebuild_sessions,updated_at")
        .eq("athlete_user_id", user.id)
        .eq("exercise_name", exerciseName)
        .neq("stage", "plateau_cleared")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || cancelled || !data) return;
      setPersistedRebuild({
        stage: data.stage as RebuildStage,
        progressFromRebuildPercent: data.progress_from_rebuild_percent,
        recoveryToPreRebuildPercent: data.recovery_to_pre_rebuild_percent,
        postRebuildSessions: Number(data.post_rebuild_sessions ?? 0),
      });
    }
    loadRebuild();
    return () => { cancelled = true; };
  }, [exerciseName]);

  const activeRebuild: RebuildSignal | null = rebuild && rebuild.stage !== "plateau_cleared"
    ? {
        stage: rebuild.stage,
        progressFromRebuildPercent: rebuild.progressFromRebuildPercent,
        recoveryToPreRebuildPercent: rebuild.recoveryToPreRebuildPercent,
        postRebuildSessions: Number(rebuild.postRebuildSessions ?? persistedRebuild?.postRebuildSessions ?? 0),
      }
    : persistedRebuild;

  if (activeRebuild && activeRebuild.stage !== "plateau_cleared") {
    const message = rebuildCoachingMessage({
      stage: activeRebuild.stage,
      exerciseName,
      progressPercent: activeRebuild.progressFromRebuildPercent,
      postRebuildSessions: activeRebuild.postRebuildSessions,
    });
    return <div className="mt-4 rounded-xl border border-[#ff0032]/45 bg-[#ff0032]/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">PHATBOT COACHING NOTE</p>
        <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-300">Rebuild Active</span>
      </div>
      <p className="mt-2 font-bold">{message.headline}</p>
      <p className="mt-1 text-sm leading-6 text-zinc-300">{message.body}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-black/30 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">From Rebuild</p><p className="mt-1 font-black">{activeRebuild.progressFromRebuildPercent !== null ? `${activeRebuild.progressFromRebuildPercent >= 0 ? "+" : ""}${activeRebuild.progressFromRebuildPercent.toFixed(1)}%` : "—"}</p></div>
        <div className="rounded-lg bg-black/30 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Vs Pre-Rebuild</p><p className="mt-1 font-black">{activeRebuild.recoveryToPreRebuildPercent !== null ? `${activeRebuild.recoveryToPreRebuildPercent >= 0 ? "+" : ""}${activeRebuild.recoveryToPreRebuildPercent.toFixed(1)}%` : "—"}</p></div>
      </div>
      <p className="mt-3 text-xs font-semibold text-zinc-200">{missionFor(activeRebuild)}</p>
    </div>;
  }

  if (plateauSessions && plateauSessions >= 3) return <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/60 p-4"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">PHATBOT COACHING NOTE</p><p className="mt-2 font-bold">PHATBOT has been watching this one.</p><p className="mt-1 text-sm leading-6 text-zinc-300">{exerciseName} has been flat for {plateauSessions} sessions. Review the recommendation below before you chase the same numbers again.</p></div>;

  if (hasPreviousPerformance) return <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs font-black uppercase tracking-[.2em] text-zinc-500">PHATBOT TARGET</p><p className="mt-2 text-sm font-semibold text-zinc-200">You have history here. PHATBOT is comparing today with the last time you actually performed this exercise. Beat that performance and the win will register immediately.</p></div>;

  return <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs font-black uppercase tracking-[.2em] text-zinc-500">PHATBOT BASELINE</p><p className="mt-2 text-sm font-semibold text-zinc-200">No previous performed sets detected for this exercise. Train clean today. PHATBOT will use this session as the baseline to beat next time.</p></div>;
}
