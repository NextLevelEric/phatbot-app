"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { RebuildProgressCard } from "@/components/RebuildProgressCard";

type Adjustment = {
  exercise_session_id: string;
  suggested_weight: number | null;
};

type Exercise = {
  id: string;
  exercise_name_snapshot: string;
};

export function PlannedRebuildReportCard({ workoutSessionId, weightUnit }: { workoutSessionId: string; weightUnit: "lb" | "kg" }) {
  const [items, setItems] = useState<{ name: string; suggestedWeight: number | null }[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: adjustments, error } = await supabase
        .from("exercise_coaching_adjustments")
        .select("exercise_session_id, suggested_weight")
        .eq("athlete_user_id", user.id)
        .eq("workout_session_id", workoutSessionId)
        .eq("adjustment_type", "plateau_rebuild");
      if (error || !adjustments?.length || cancelled) return;
      const rows = adjustments as Adjustment[];
      const { data: exercises } = await supabase
        .from("exercise_sessions")
        .select("id, exercise_name_snapshot")
        .in("id", rows.map((row) => row.exercise_session_id));
      const names = new Map(((exercises ?? []) as Exercise[]).map((row) => [row.id, row.exercise_name_snapshot]));
      if (!cancelled) setItems(rows.map((row) => ({ name: names.get(row.exercise_session_id) ?? "Exercise", suggestedWeight: row.suggested_weight })));
    }
    load();
    return () => { cancelled = true; };
  }, [workoutSessionId]);

  return <div className="flex flex-col gap-4">
    {items.length > 0 && <section className="rounded-2xl border border-[#ff0032]/45 bg-[#ff0032]/5 p-6">
      <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT PLANNED REBUILD</p>
      <h2 className="mt-3 text-2xl font-black">Adjustment executed. That was the plan.</h2>
      <p className="mt-3 leading-7 text-zinc-200">You followed a PHATBOT coaching adjustment in this workout. A deliberate reset is not the same thing as losing strength, so PHATBOT protects this work from being treated like an ordinary regression.</p>
      <div className="mt-4 flex flex-col gap-2">{items.map((item, index) => <div key={`${item.name}-${index}`} className="rounded-xl border border-zinc-800 bg-black/25 px-4 py-3">
        <p className="font-bold">{item.name}</p>
        <p className="mt-1 text-sm text-zinc-400">{item.suggestedWeight ? `Rebuild target: about ${item.suggestedWeight} ${weightUnit}. ` : "Controlled rebuild prescribed. "}Clean reps now. Then we build back up.</p>
      </div>)}</div>
      <p className="mt-4 text-sm font-semibold text-zinc-200">Next mission: establish clean performance at the rebuild load, then create progress from the new baseline.</p>
    </section>}

    <RebuildProgressCard workoutSessionId={workoutSessionId} />
  </div>;
}
