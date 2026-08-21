"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { PlateauRecommendation } from "@/features/coaching/plateauCoaching";
import { rebuildCoachingMessage } from "@/features/coaching/rebuildProgress";

type Props = {
  workoutSessionId: string;
  exerciseSessionId: string;
  exerciseId: string;
  recommendation: PlateauRecommendation;
  onAccepted?: () => void;
};

type RebuildStage = "rebuild_started" | "baseline_established" | "rebuilding_progress" | "plateau_cleared";
type RebuildProgress = {
  stage: RebuildStage;
  exercise_name: string;
  progress_from_rebuild_percent: number | null;
  recovery_to_pre_rebuild_percent: number | null;
};

const PROTECTED_REBUILD_MARKER = "PHATBOT planned rebuild";

export function PlateauRecommendationCard({ workoutSessionId, exerciseSessionId, exerciseId, recommendation, onAccepted }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [rebuild, setRebuild] = useState<RebuildProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const [{ data: adjustment }, { data: rebuildRow }] = await Promise.all([
        supabase
          .from("exercise_coaching_adjustments")
          .select("id")
          .eq("athlete_user_id", user.id)
          .eq("exercise_session_id", exerciseSessionId)
          .eq("adjustment_type", "plateau_rebuild")
          .maybeSingle(),
        supabase
          .from("exercise_rebuild_progress")
          .select("stage,exercise_name,progress_from_rebuild_percent,recovery_to_pre_rebuild_percent")
          .eq("athlete_user_id", user.id)
          .eq("exercise_id", exerciseId)
          .neq("stage", "plateau_cleared")
          .maybeSingle(),
      ]);

      if (cancelled) return;
      setAccepted(Boolean(adjustment));
      setRebuild((rebuildRow ?? null) as RebuildProgress | null);
    }
    load();
    return () => { cancelled = true; };
  }, [exerciseId, exerciseSessionId]);

  async function acceptRecommendation() {
    if (accepted || working || rebuild) return;
    setWorking(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const { error } = await supabase.from("exercise_coaching_adjustments").upsert({
        athlete_user_id: user.id,
        workout_session_id: workoutSessionId,
        exercise_session_id: exerciseSessionId,
        exercise_id: exerciseId,
        adjustment_type: "plateau_rebuild",
        source: "phatbot",
        suggested_weight: recommendation.suggestedWeight,
        accepted_at: new Date().toISOString(),
      }, { onConflict: "exercise_session_id,adjustment_type" });
      if (error) { setMessage(error.message); return; }

      const { data: exerciseRow, error: noteReadError } = await supabase.from("exercise_sessions").select("notes").eq("id", exerciseSessionId).single();
      if (noteReadError) { setMessage("Recommendation saved, but PHATBOT could not protect the scoring state yet. Please try again before completing the workout."); return; }
      const currentNotes = (exerciseRow?.notes ?? "").trim();
      const protectedNotes = currentNotes.toLowerCase().includes(PROTECTED_REBUILD_MARKER.toLowerCase())
        ? currentNotes
        : [currentNotes, PROTECTED_REBUILD_MARKER].filter(Boolean).join(" · ");
      const { error: noteWriteError } = await supabase.from("exercise_sessions").update({ notes: protectedNotes }).eq("id", exerciseSessionId);
      if (noteWriteError) { setMessage("Recommendation saved, but PHATBOT could not protect the scoring state yet. Please try again before completing the workout."); return; }

      setAccepted(true);
      onAccepted?.();
      setMessage("Adjustment accepted. PHATBOT will score this as an intentional rebuild rather than an ordinary regression.");
    } catch {
      setMessage("PHATBOT could not save that coaching decision. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  if (rebuild) {
    const coaching = rebuildCoachingMessage({
      stage: rebuild.stage,
      exerciseName: rebuild.exercise_name,
      progressPercent: rebuild.progress_from_rebuild_percent,
    });
    return <div className="mt-4 rounded-xl border border-[#ff0032]/50 bg-[#ff0032]/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">PHATBOT COACHING NOTE</p>
        <span className="rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-300">Rebuild Active</span>
      </div>
      <p className="mt-2 font-bold">{coaching.headline}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{coaching.body}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-black/30 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">From Rebuild</p><p className="mt-1 text-sm font-black">{rebuild.progress_from_rebuild_percent !== null ? `${rebuild.progress_from_rebuild_percent >= 0 ? "+" : ""}${rebuild.progress_from_rebuild_percent.toFixed(1)}%` : "Baseline"}</p></div>
        <div className="rounded-lg bg-black/30 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Vs Pre-Rebuild</p><p className="mt-1 text-sm font-black">{rebuild.recovery_to_pre_rebuild_percent !== null ? `${rebuild.recovery_to_pre_rebuild_percent >= 0 ? "+" : ""}${rebuild.recovery_to_pre_rebuild_percent.toFixed(1)}%` : "Tracking"}</p></div>
      </div>
      <p className="mt-3 rounded-lg bg-black/30 px-3 py-2 text-sm font-semibold text-white">Today&apos;s mission: build from the rebuild baseline with clean, controlled progress. Do not rush the old load just to chase a number.</p>
      <p className="mt-2 text-[11px] text-zinc-500">PHATBOT is still tracking this intervention. Normal progression resumes when the pre-rebuild strength signal is cleared.</p>
    </div>;
  }

  return <div className={`mt-4 rounded-xl border p-4 ${accepted ? "border-[#ff0032] bg-[#ff0032]/15" : "border-[#ff0032]/50 bg-[#ff0032]/10"}`}>
    <p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">PHATBOT NOTE</p>
    <p className="mt-2 font-bold">{recommendation.headline}</p>
    <p className="mt-2 text-sm leading-6 text-zinc-300">{recommendation.body}</p>
    <p className="mt-3 rounded-lg bg-black/30 px-3 py-2 text-sm font-semibold text-white">Recommended adjustment: {recommendation.action}</p>
    {accepted ? <div className="mt-3 rounded-lg border border-[#ff0032]/40 bg-black/20 px-3 py-3">
      <p className="text-sm font-bold text-[#ff0032]">✓ PHATBOT recommendation accepted</p>
      <p className="mt-1 text-xs text-zinc-400">This exercise is protected as a deliberate coaching adjustment for this workout.</p>
    </div> : <button type="button" disabled={working} onClick={acceptRecommendation} className="mt-3 w-full rounded-lg bg-[#ff0032] px-4 py-3 text-sm font-bold text-white hover:bg-[#e6002d] disabled:opacity-50">{working ? "PHATBOT Saving..." : "Follow PHATBOT Recommendation"}</button>}
    <p className="mt-2 text-[11px] text-zinc-500">PHATBOT never changes your load automatically. You remain in control of what you enter.</p>
    {message && <p className="mt-2 text-xs text-zinc-300">{message}</p>}
  </div>;
}
