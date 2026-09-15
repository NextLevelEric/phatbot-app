"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import CardioTrendPanel from "@/components/CardioTrendPanel";
import {
  buildComparableEffortGroups,
  findComparableEffortGroup,
  loadComparableEffortData,
  type CardioActivityRow,
  type CardioSegmentRow,
} from "@/features/cardio/comparableEfforts";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function BenchmarkDetail() {
  const params = useParams<{ type: string; segment: string }>();
  const activityToken = decodeURIComponent(params.type);
  const segmentKey = decodeURIComponent(params.segment);
  const [segments, setSegments] = useState<CardioSegmentRow[]>([]);
  const [activities, setActivities] = useState<Record<string, CardioActivityRow>>({});
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

  const group = useMemo(() => findComparableEffortGroup(
    buildComparableEffortGroups(segments, activities),
    activityToken,
    segmentKey,
  ), [activities, activityToken, segmentKey, segments]);

  if (loading) return <main className="mx-auto max-w-2xl px-5 py-10 text-zinc-400">Loading cardio trend…</main>;
  if (failed) return <main className="mx-auto max-w-2xl px-5 py-10"><Link href="/progress/activity" className="text-sm font-bold text-zinc-500">← Activity</Link><section className="mt-6 rounded-3xl border border-[#ff0032]/30 bg-[#ff0032]/5 p-5"><p className="font-black">Cardio trends are temporarily unavailable.</p><p className="mt-2 text-sm text-zinc-400">Your saved activity is safe. Try again from Activity.</p></section></main>;
  if (!group) return <main className="mx-auto max-w-2xl px-5 py-10"><Link href="/progress/activity" className="text-sm font-bold text-zinc-500">← Activity</Link><section className="mt-6 rounded-3xl border border-zinc-800 p-5"><p className="font-black">No comparable efforts found for this activity.</p><p className="mt-2 text-sm text-zinc-500">Choose another benchmark from your Activity page.</p></section></main>;

  return <main className="mx-auto min-h-screen max-w-2xl px-4 py-8 sm:px-6">
    <Link href="/progress/activity" className="text-sm font-bold text-zinc-500">← Cardio progression</Link>
    <p className="mt-6 text-xs font-black tracking-[.2em] text-[#ff0032]">PHATBOT Cardio</p>
    <h1 className="mt-2 text-3xl font-black">{group.displayLabel}</h1>
    <CardioTrendPanel group={group} />
  </main>;
}
