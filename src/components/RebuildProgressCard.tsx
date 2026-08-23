"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { rebuildCoachingMessage } from "@/features/coaching/rebuildProgress";

type Stage = "rebuild_started" | "baseline_established" | "rebuilding_progress" | "plateau_cleared";
type RebuildRow = {
  exercise_id: string;
  exercise_name: string;
  rebuild_workout_session_id: string;
  stage: Stage;
  pre_rebuild_strength: number | null;
  progress_from_rebuild_percent: number | null;
  recovery_to_pre_rebuild_percent: number | null;
  post_rebuild_sessions: number;
};
type LaterExerciseRow = {
  workout_session_id: string;
  sets: { weight: number; reps: number; set_type: string }[];
};

const stageLabel: Record<Stage, string> = {
  rebuild_started: "REBUILD STARTED",
  baseline_established: "BASELINE ESTABLISHED",
  rebuilding_progress: "REBUILDING PROGRESS",
  plateau_cleared: "PLATEAU CLEARED",
};

function estimatedStrength(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

function bestStrength(sets: LaterExerciseRow["sets"]) {
  return Math.max(0, ...(sets ?? [])
    .filter((set) => set.set_type !== "warmup" && Number(set.reps) > 0)
    .map((set) => estimatedStrength(Number(set.weight), Number(set.reps))));
}

export function RebuildProgressCard({ workoutSessionId }: { workoutSessionId: string }) {
  const [rows, setRows] = useState<RebuildRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data, error } = await supabase
        .from("exercise_rebuild_progress")
        .select("exercise_id,exercise_name,rebuild_workout_session_id,stage,pre_rebuild_strength,progress_from_rebuild_percent,recovery_to_pre_rebuild_percent,post_rebuild_sessions")
        .eq("athlete_user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error || cancelled) return;

      const visible: RebuildRow[] = [];
      for (const row of (data ?? []) as RebuildRow[]) {
        if (row.rebuild_workout_session_id === workoutSessionId) {
          visible.push(row);
          continue;
        }
        if (row.post_rebuild_sessions <= 0) continue;

        // A cleared intervention is historical state, not an active state. Show its
        // celebration card only on the first workout that actually cleared it.
        if (row.stage === "plateau_cleared") {
          if (!row.pre_rebuild_strength) continue;
          const { data: rebuildWorkout } = await supabase
            .from("workout_sessions")
            .select("completed_at")
            .eq("id", row.rebuild_workout_session_id)
            .eq("athlete_user_id", user.id)
            .maybeSingle();
          if (!rebuildWorkout?.completed_at) continue;

          const { data: laterSessions } = await supabase
            .from("workout_sessions")
            .select("id,completed_at")
            .eq("athlete_user_id", user.id)
            .eq("status", "completed")
            .gt("completed_at", rebuildWorkout.completed_at)
            .order("completed_at", { ascending: true });
          const laterIds = (laterSessions ?? []).map((session) => session.id);
          if (!laterIds.length) continue;

          const { data: laterExercises } = await supabase
            .from("exercise_sessions")
            .select("workout_session_id,sets(weight,reps,set_type)")
            .eq("exercise_id", row.exercise_id)
            .in("workout_session_id", laterIds);
          const bySession = new Map<string, number>();
          for (const exercise of (laterExercises ?? []) as LaterExerciseRow[]) {
            bySession.set(exercise.workout_session_id, bestStrength(exercise.sets ?? []));
          }

          let exposureCount = 0;
          let clearingSessionId: string | null = null;
          for (const session of laterSessions ?? []) {
            const strength = bySession.get(session.id) ?? 0;
            if (strength <= 0) continue;
            exposureCount += 1;
            const recoveryPercent = ((strength - row.pre_rebuild_strength) / row.pre_rebuild_strength) * 100;
            if (exposureCount >= 2 && recoveryPercent >= 1) {
              clearingSessionId = session.id;
              break;
            }
          }
          if (clearingSessionId === workoutSessionId) visible.push(row);
          continue;
        }

        // Active rebuild stages remain visible on later reports while the
        // intervention is still in progress.
        visible.push(row);
      }
      if (!cancelled) setRows(visible.slice(0, 3));
    }
    load();
    return () => { cancelled = true; };
  }, [workoutSessionId]);

  if (!rows.length) return null;

  return <section className="flex flex-col gap-3">
    {rows.map((row) => {
      const message = rebuildCoachingMessage({ stage: row.stage, exerciseName: row.exercise_name, progressPercent: row.progress_from_rebuild_percent, postRebuildSessions: row.post_rebuild_sessions });
      return <div key={row.exercise_id} className={`rounded-2xl border p-6 ${row.stage === "plateau_cleared" ? "border-[#ff0032]/60 bg-[#ff0032]/10" : "border-zinc-700 bg-zinc-950"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT REBUILD STATUS</p>
          <span className="rounded-full bg-zinc-900 px-3 py-1 text-[10px] font-black tracking-wider text-zinc-300">{stageLabel[row.stage]}</span>
        </div>
        <h2 className="mt-3 text-2xl font-black">{message.headline}</h2>
        <p className="mt-2 text-base leading-7 text-zinc-200">{message.body}</p>
        {row.post_rebuild_sessions > 0 && <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-zinc-900 p-3"><p className="text-xs uppercase tracking-wider text-zinc-500">From Rebuild</p><p className="mt-1 text-xl font-black">{row.progress_from_rebuild_percent !== null ? `${row.progress_from_rebuild_percent >= 0 ? "+" : ""}${row.progress_from_rebuild_percent.toFixed(1)}%` : "—"}</p></div>
          <div className="rounded-xl bg-zinc-900 p-3"><p className="text-xs uppercase tracking-wider text-zinc-500">Vs Pre-Rebuild</p><p className="mt-1 text-xl font-black">{row.recovery_to_pre_rebuild_percent !== null ? `${row.recovery_to_pre_rebuild_percent >= 0 ? "+" : ""}${row.recovery_to_pre_rebuild_percent.toFixed(1)}%` : "—"}</p></div>
        </div>}
      </div>;
    })}
  </section>;
}
