"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CardioSnapshot, RecentCardioActivities } from "@/components/CardioDashboard";
import { DAY_MS, type Activity } from "@/features/cardio/activityReport";
import { loadActivityWindow } from "@/features/cardio/activityReportData";
import CardioSegmentProgress from "@/components/CardioSegmentProgress";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type DailyMetric = { metric_date: string; steps: number | null; active_energy_kcal: number | null };
function fmtDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }

export default function ActivityProgressPage() {
  const [days, setDays] = useState<DailyMetric[]>([]), [activities, setActivities] = useState<Activity[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(Date.now);
  const [revision, setRevision] = useState(0);

  async function loadActivity(userId: string) {
    const supabase = createSupabaseBrowserClient();
    const now = Date.now();
    try {
      const [dailyResult, cardioRows] = await Promise.all([
        supabase.from("health_daily_metrics").select("metric_date,steps,active_energy_kcal").eq("athlete_user_id", userId).order("metric_date", { ascending: false }).limit(30),
        loadActivityWindow(supabase, userId, new Date(now - 60 * DAY_MS).toISOString(), new Date(now).toISOString()),
      ]);
      setError(dailyResult.error ? "Daily steps could not load. Your cardio history is available below." : null);
      setDays((dailyResult.data ?? []) as DailyMetric[]);
      setActivities(cardioRows);
      setAsOf(now);
      setRevision(value => value + 1);
    } catch { setError("PHATBOT couldn't load all activity history. Your saved data is safe. Try again."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { window.location.href = "/auth"; return; }
      await loadActivity(user.id);
      if (!active) return;
    }
    void load().catch(() => { if (active) { setLoading(false); setError("PHATBOT couldn't load activity history. Try again."); } });
    return () => { active = false; };
  }, []);

  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Activity</p><h1 className="mt-2 text-3xl font-black">Reading the engine...</h1></main>;
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-10">
    <header><Link href="/progress" className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">← Progress</Link><p className="mt-4 text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Activity</p><h1 className="mt-2 text-3xl font-black">Activity &amp; Cardio</h1><p className="mt-2 text-zinc-400">See the big picture first, then compare like-for-like cardio efforts.</p></header>
    {error && <p className="rounded-xl border border-[#ff0032]/40 bg-[#ff0032]/5 p-4 text-sm">{error}</p>}
    {(!error || activities.length > 0) && <CardioSnapshot activities={activities} asOf={asOf} />}
    <section><div className="mb-3"><p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Progression</p><h2 className="mt-1 text-xl font-black">Comparable cardio efforts</h2><p className="mt-1 text-sm leading-6 text-zinc-500">PHATBOT compares the same activity type and distance, including matching segments inside longer workouts.</p></div><div key={revision}><CardioSegmentProgress /></div></section>
    {(!error || activities.length > 0) && <RecentCardioActivities activities={activities} asOf={asOf} />}
    <details className="rounded-2xl border border-zinc-900"><summary className="cursor-pointer list-none p-4 text-sm font-bold text-zinc-500">View daily steps</summary><div className="border-t border-zinc-900 p-4">{days.length===0?<p className="text-sm text-zinc-500">No synced daily activity yet.</p>:days.slice(0,14).map(day=><div key={day.metric_date} className="flex items-center justify-between border-b border-zinc-900 py-3 last:border-0"><p className="text-sm font-semibold">{fmtDate(`${day.metric_date}T12:00:00`)}</p><p className="font-black">{day.steps==null?"—":Number(day.steps).toLocaleString()}</p></div>)}</div></details>
  </main>;
}
