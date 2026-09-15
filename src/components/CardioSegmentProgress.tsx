"use client";

import { useEffect, useMemo, useState } from "react";
import CardioTrendPanel from "@/components/CardioTrendPanel";
import {
  buildComparableEffortGroups,
  loadComparableEffortData,
  type CardioActivityRow,
  type CardioSegmentRow,
} from "@/features/cardio/comparableEfforts";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function CardioSegmentProgress() {
  const [segments, setSegments] = useState<CardioSegmentRow[]>([]);
  const [activities, setActivities] = useState<Record<string, CardioActivityRow>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) { setLoading(false); return; }
      try {
        const result = await loadComparableEffortData(supabase, user.id);
        if (!active) return;
        setSegments(result.segments);
        setActivities(result.activities);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => buildComparableEffortGroups(segments, activities), [segments, activities]);
  const selected = groups.find((group) => group.key === selectedKey) ?? groups[0] ?? null;

  if (loading) return <section className="rounded-3xl border border-zinc-800 p-5"><p className="text-sm text-zinc-500">Loading comparable cardio efforts…</p></section>;
  if (failed) return <section className="rounded-3xl border border-[#ff0032]/30 bg-[#ff0032]/5 p-5"><p className="font-black">Cardio trends are temporarily unavailable.</p><p className="mt-2 text-sm text-zinc-400">Your saved activity is safe. Try refreshing this page.</p></section>;
  if (!selected) return <section className="rounded-3xl border border-zinc-800 p-5"><p className="font-black">No comparable efforts yet.</p><p className="mt-2 text-sm leading-6 text-zinc-500">Complete a standard run or walk distance to establish your first activity-specific benchmark.</p></section>;

  return <section>
    <div className="rounded-3xl border border-[#ff0032]/30 bg-[#ff0032]/5 p-5">
      <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#ff0032]">Cardio progression</p>
      <h2 className="mt-2 text-2xl font-black">Your comparable efforts</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">Choose an activity and distance. Runs compare with runs, walks with walks, including matching segments inside longer workouts.</p>
      <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2" aria-label="Comparable cardio efforts">
        {groups.map((group) => <button type="button" key={group.key} onClick={() => setSelectedKey(group.key)} aria-pressed={selected.key === group.key} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-black transition ${selected.key === group.key ? "border-[#ff0032] bg-[#ff0032] text-white" : "border-zinc-700 bg-black/20 text-zinc-300"}`}>
          {group.displayLabel} <span className="ml-1 opacity-60">{group.efforts.length}</span>
        </button>)}
      </div>
    </div>
    <CardioTrendPanel group={selected} />
  </section>;
}
