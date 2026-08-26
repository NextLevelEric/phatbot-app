"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { classifyLivePersonalRecord, type LivePRBadge } from "@/features/scoring/livePersonalRecords";
import type { PRSet } from "@/features/scoring/personalRecords";

type LiveSet = {
  id: string;
  set_type: string;
  weight: number;
  reps: number;
  partial_reps: number;
};

type Props = {
  exerciseId: string;
  sessionStartedAt: string;
  sets: LiveSet[];
  weightUnit: "lb" | "kg";
};

type HistoricalRow = { sets: LiveSet[] | null };
type DisplayRecord = { setId: string; set: LiveSet; badge: LivePRBadge };

function toPRSet(set: LiveSet): PRSet {
  return {
    weight: Number(set.weight),
    reps: set.reps,
    partialReps: set.partial_reps,
    setType: set.set_type,
  };
}

export function LivePersonalRecordBadges({ exerciseId, sessionStartedAt, sets, weightUnit }: Props) {
  const [historicalSets, setHistoricalSets] = useState<PRSet[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("exercise_sessions")
        .select("sets(id,set_type,weight,reps,partial_reps),workout_sessions!inner(completed_at,athlete_user_id,status)")
        .eq("exercise_id", exerciseId)
        .eq("workout_sessions.athlete_user_id", user.id)
        .eq("workout_sessions.status", "completed")
        .lt("workout_sessions.completed_at", sessionStartedAt);
      if (cancelled) return;
      if (error) {
        setHistoricalSets([]);
        return;
      }
      setHistoricalSets(((data ?? []) as HistoricalRow[]).flatMap((row) => row.sets ?? []).map(toPRSet));
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [exerciseId, sessionStartedAt]);

  const records = useMemo<DisplayRecord[]>(() => {
    if (historicalSets === null || historicalSets.length === 0) return [];
    const prior = [...historicalSets];
    const found: DisplayRecord[] = [];
    for (const set of sets) {
      const current = toPRSet(set);
      const badge = classifyLivePersonalRecord(current, prior);
      if (badge) found.push({ setId: set.id, set, badge });
      prior.push(current);
    }
    return found;
  }, [historicalSets, sets]);

  if (!records.length) return null;

  return (
    <div className="mt-4 flex flex-col gap-2">
      {records.map(({ setId, set, badge }) => (
        <div key={setId} className={`rounded-xl border p-3 ${badge.classification === "true_pr" ? "border-[#ff0032]/70 bg-[#ff0032]/10" : "border-zinc-700 bg-zinc-900"}`}>
          <p className={`text-xs font-black uppercase tracking-[.16em] ${badge.classification === "true_pr" ? "text-[#ff0032]" : "text-zinc-300"}`}>{badge.label}</p>
          <p className="mt-1 text-sm font-semibold">{set.weight} {weightUnit} × {set.reps}{set.partial_reps ? ` + ${set.partial_reps} partial` : ""}</p>
          <p className="mt-1 text-xs text-zinc-400">{badge.detail}</p>
        </div>
      ))}
    </div>
  );
}
