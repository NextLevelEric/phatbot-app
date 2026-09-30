"use client";

import { useEffect, useRef, useState } from "react";
import { CardioSnapshot, RecentCardioActivities } from "@/components/CardioDashboard";
import { DAY_MS, type Activity } from "@/features/cardio/activityReport";
import { loadActivityWindow } from "@/features/cardio/activityReportData";
import CardioSegmentProgress from "@/components/CardioSegmentProgress";
import { getNativeHealthProvider, requestNativeHealthAccess, type PhatbotHealthProvider } from "@/lib/health";
import { healthSyncErrorMessage, healthSyncSummary, syncNativeHealth } from "@/lib/healthSync";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type DailyMetric = { metric_date: string; steps: number | null; active_energy_kcal: number | null };
function fmtDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }

export default function ActivityProgressPage() {
  const [days, setDays] = useState<DailyMetric[]>([]), [activities, setActivities] = useState<Activity[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<PhatbotHealthProvider>("none");
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const syncBusy = useRef(false);
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

  async function refreshFromDevice(userId: string, authorize = false) {
    if (syncBusy.current) return;
    syncBusy.current = true;
    setSyncing(true);
    setSyncMessage("");
    try {
      if (authorize) {
        const access = await requestNativeHealthAccess();
        if (!access.authorized) { setSyncMessage("Allow health access, then try syncing again."); return; }
      }
      const result = await syncNativeHealth(14);
      if (!result) { setSyncMessage("Health data is unavailable on this device."); return; }
      setSyncMessage(healthSyncSummary(result));
      if (result.status === "synced") {
        setConnected(true);
        await loadActivity(userId);
      }
    } catch (reason) { setSyncMessage(healthSyncErrorMessage(reason)); }
    finally { syncBusy.current = false; setSyncing(false); }
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
      const nativeProvider = getNativeHealthProvider();
      setProvider(nativeProvider);
      if (nativeProvider === "none") return;
      const { data, error: connectionError } = await supabase.from("athlete_health_connections")
        .select("last_synced_at").eq("athlete_user_id", user.id).eq("provider", nativeProvider).maybeSingle();
      if (!active) return;
      if (connectionError) { setSyncMessage("Could not check health connection. You can still try syncing."); return; }
      setConnected(Boolean(data));
      if (data) await refreshFromDevice(user.id);
    }
    void load().catch(() => { if (active) { setLoading(false); setError("PHATBOT couldn't load activity history. Try again."); } });
    return () => { active = false; };
  }, []);

  async function syncNow() {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/auth"; return; }
    await refreshFromDevice(user.id, !connected);
  }
  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Activity</p><h1 className="mt-2 text-3xl font-black">Reading the engine...</h1></main>;
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-10">
    <header><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Activity</p><h1 className="mt-2 text-3xl font-black">Activity &amp; Cardio</h1><p className="mt-2 text-zinc-400">Your whole workouts, recent training volume, and comparable progress.</p></header>
    {provider !== "none" && <section className="rounded-2xl border border-zinc-800 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-300">{syncing ? "Checking your latest health data..." : "Activity updates when this page opens."}</p><button type="button" disabled={syncing} onClick={() => void syncNow()} className="min-h-11 rounded-xl border border-zinc-600 px-4 py-2 text-sm font-bold disabled:opacity-50">{syncing ? "Syncing..." : connected ? "Sync now" : "Connect health data"}</button></div>{syncMessage && <p role="status" className="mt-3 text-sm text-zinc-400">{syncMessage}</p>}</section>}
    {error && <p className="rounded-xl border border-[#ff0032]/40 bg-[#ff0032]/5 p-4 text-sm">{error}</p>}
    {(!error || activities.length > 0) && <CardioSnapshot activities={activities} asOf={asOf} />}
    <p className="text-sm leading-6 text-zinc-500">Standardized cardio benchmarks compare the same activity type and distance, including segments inside longer workouts.</p>
    <div key={revision}><CardioSegmentProgress /></div>
    {(!error || activities.length > 0) && <RecentCardioActivities activities={activities} asOf={asOf} />}
    <details className="rounded-2xl border border-zinc-900"><summary className="cursor-pointer list-none p-4 text-sm font-bold text-zinc-500">View daily steps</summary><div className="border-t border-zinc-900 p-4">{days.length===0?<p className="text-sm text-zinc-500">No synced daily activity yet.</p>:days.slice(0,14).map(day=><div key={day.metric_date} className="flex items-center justify-between border-b border-zinc-900 py-3 last:border-0"><p className="text-sm font-semibold">{fmtDate(`${day.metric_date}T12:00:00`)}</p><p className="font-black">{day.steps==null?"—":Number(day.steps).toLocaleString()}</p></div>)}</div></details>
  </main>;
}
