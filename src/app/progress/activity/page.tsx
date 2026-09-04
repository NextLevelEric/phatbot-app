"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type DailyMetric = { metric_date: string; steps: number | null; active_energy_kcal: number | null };
type CardioActivity = { id: string; activity_name: string | null; activity_type: number; started_at: string; duration_seconds: number; distance_meters: number | null; active_energy_kcal: number | null; average_heart_rate_bpm: number | null };
type Comparison = { prior: CardioActivity; status: "better" | "same" | "mixed"; message: string };
type TrendStatus = "Improving" | "Steady" | "Needs More Data";
type Benchmark = { key: string; label: string; activity: CardioActivity; efforts: CardioActivity[]; best: CardioActivity; previous: CardioActivity | null; status: TrendStatus; changeSeconds: number | null; hrChange: number | null };

const MILE_METERS = 1609.344;
function miles(meters: number | null) { return meters == null ? null : meters / MILE_METERS; }
function duration(seconds: number) { const mins = Math.round(seconds / 60); const h = Math.floor(mins / 60); const m = mins % 60; return h ? `${h}h ${m}m` : `${m} min`; }
function clock(seconds: number) { const total = Math.max(0, Math.round(seconds)); const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60; return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`; }
function paceSeconds(seconds: number, meters: number | null) { const mi = miles(meters); return !mi || mi <= 0 ? null : seconds / mi; }
function pace(seconds: number, meters: number | null) { const value = paceSeconds(seconds, meters); if (value == null) return null; const mins = Math.floor(value / 60), secs = Math.round(value % 60); return `${mins}:${String(secs).padStart(2,"0")}/mi`; }
function speedMph(seconds: number, meters: number | null) { const mi = miles(meters); return !mi || seconds <= 0 ? null : mi / (seconds / 3600); }
function fmtDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function normalizedName(activity: CardioActivity) { return (activity.activity_name ?? "Workout").trim().toLowerCase(); }
function isRun(activity: CardioActivity) { const name = normalizedName(activity); return name === "run" || name.includes("running"); }
function isCycling(activity: CardioActivity) { const name = normalizedName(activity); return name.includes("bike") || name.includes("cycling"); }
function isPerformanceCardio(activity: CardioActivity) { const name = normalizedName(activity); return isRun(activity) || isCycling(activity) || name === "rowing" || name === "swim" || name === "swimming"; }
function isCardioActivity(activity: CardioActivity) { const name = normalizedName(activity); return ["run","running","walk","walking","bike ride","cycling","hike","rowing","swim","swimming","elliptical","stair climbing","mixed cardio","hiit"].some((label) => name.includes(label)); }
function localDayKey(date: Date) { const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2,"0"), d = String(date.getDate()).padStart(2,"0"); return `${y}-${m}-${d}`; }
function sevenDayStartKey() { const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate() - 6); return localDayKey(start); }
function sevenDayStartTime() { const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate() - 6); return start.getTime(); }
function distanceWithin(activity: CardioActivity, targetMeters: number, tolerance = 0.05) { return activity.distance_meters != null && Math.abs(activity.distance_meters - targetMeters) / targetMeters <= tolerance; }
function benchmarkKey(activity: CardioActivity) {
  if (!activity.distance_meters || !isPerformanceCardio(activity)) return null;
  if (isRun(activity)) {
    if (distanceWithin(activity, 5000, 0.04)) return { key: "run-5k", label: "5K Run" };
    if (distanceWithin(activity, MILE_METERS, 0.04)) return { key: "run-1mi", label: "1 Mile Run" };
    if (distanceWithin(activity, 10000, 0.04)) return { key: "run-10k", label: "10K Run" };
  }
  const mi = miles(activity.distance_meters); if (!mi) return null;
  const rounded = Math.max(1, Math.round(mi));
  if (Math.abs(mi - rounded) / rounded <= 0.08) return { key: `${activity.activity_type}-${rounded}mi`, label: `${rounded} Mile ${activity.activity_name ?? "Workout"}` };
  return null;
}
function comparable(a: CardioActivity, b: CardioActivity) { if (!isPerformanceCardio(a) || a.activity_type !== b.activity_type || !a.distance_meters || !b.distance_meters) return false; return Math.abs(a.distance_meters - b.distance_meters) / b.distance_meters <= 0.08; }
function comparisonFor(activity: CardioActivity, older: CardioActivity[]): Comparison | null {
  const prior = older.find((candidate) => comparable(activity, candidate)); if (!prior) return null;
  const currentPace = paceSeconds(Number(activity.duration_seconds), activity.distance_meters), priorPace = paceSeconds(Number(prior.duration_seconds), prior.distance_meters); if (currentPace == null || priorPace == null) return null;
  const paceDelta = priorPace - currentPace, pacePct = Math.abs(paceDelta) / priorPace;
  const currentHr = activity.average_heart_rate_bpm == null ? null : Number(activity.average_heart_rate_bpm), priorHr = prior.average_heart_rate_bpm == null ? null : Number(prior.average_heart_rate_bpm), hrDelta = currentHr != null && priorHr != null ? priorHr - currentHr : null;
  const metricLabel = isCycling(activity) ? "speed" : "pace";
  if (pacePct >= 0.01 && paceDelta > 0) return { prior, status: "better", message: `Performance win. ${metricLabel === "speed" ? "Average speed improved" : `Pace improved by ${clock(paceDelta)} per mile`} versus ${fmtDate(prior.started_at)}.${hrDelta != null && hrDelta > 1 ? ` Average heart rate was also ${Math.round(hrDelta)} bpm lower.` : ""}` };
  if (pacePct <= 0.01 && hrDelta != null && hrDelta >= 3) return { prior, status: "better", message: `Efficiency win. ${metricLabel === "speed" ? "Speed" : "Pace"} was essentially the same, but average heart rate was ${Math.round(hrDelta)} bpm lower than ${fmtDate(prior.started_at)}.` };
  if (pacePct <= 0.01) return { prior, status: "same", message: `Comparable effort detected. ${metricLabel === "speed" ? "Speed" : "Pace"} was essentially unchanged from ${fmtDate(prior.started_at)}.` };
  return { prior, status: "mixed", message: `Comparable effort detected. This was below the ${fmtDate(prior.started_at)} effort, but PHATBOT will keep it in trend context.` };
}
function trendStatus(efforts: CardioActivity[]): TrendStatus {
  if (efforts.length < 2) return "Needs More Data";
  const latest = efforts[0], previous = efforts[1];
  const latestPace = paceSeconds(Number(latest.duration_seconds), latest.distance_meters), priorPace = paceSeconds(Number(previous.duration_seconds), previous.distance_meters);
  if (latestPace == null || priorPace == null) return "Needs More Data";
  const paceImprovement = (priorPace - latestPace) / priorPace;
  const latestHr = latest.average_heart_rate_bpm == null ? null : Number(latest.average_heart_rate_bpm), priorHr = previous.average_heart_rate_bpm == null ? null : Number(previous.average_heart_rate_bpm);
  if (paceImprovement >= 0.01) return "Improving";
  if (Math.abs(paceImprovement) <= 0.01 && latestHr != null && priorHr != null && priorHr - latestHr >= 3) return "Improving";
  if (Math.abs(paceImprovement) <= 0.02) return "Steady";
  return efforts.length < 3 ? "Needs More Data" : "Steady";
}
function buildBenchmarks(activities: CardioActivity[]): Benchmark[] {
  const groups = new Map<string, { label: string; efforts: CardioActivity[] }>();
  for (const activity of activities) { const bucket = benchmarkKey(activity); if (!bucket) continue; const group = groups.get(bucket.key) ?? { label: bucket.label, efforts: [] }; group.efforts.push(activity); groups.set(bucket.key, group); }
  return Array.from(groups.entries()).map(([key, group]) => {
    const efforts = [...group.efforts].sort((a,b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    const best = [...efforts].sort((a,b) => Number(a.duration_seconds) - Number(b.duration_seconds))[0], latest = efforts[0], previous = efforts[1] ?? null;
    const changeSeconds = previous ? Number(previous.duration_seconds) - Number(latest.duration_seconds) : null;
    const latestHr = latest.average_heart_rate_bpm == null ? null : Number(latest.average_heart_rate_bpm), priorHr = previous?.average_heart_rate_bpm == null ? null : Number(previous.average_heart_rate_bpm), hrChange = latestHr != null && priorHr != null ? priorHr - latestHr : null;
    return { key, label: group.label, activity: latest, efforts, best, previous, status: trendStatus(efforts), changeSeconds, hrChange };
  }).sort((a,b) => new Date(b.activity.started_at).getTime() - new Date(a.activity.started_at).getTime());
}
function trendSummary(benchmark: Benchmark) {
  if (!benchmark.previous) return "Baseline established. One more matching effort will unlock a real trend.";
  if (benchmark.changeSeconds != null && benchmark.changeSeconds > 3) return `Performance win: ${clock(benchmark.changeSeconds)} faster than the previous ${benchmark.label}.${benchmark.hrChange != null && benchmark.hrChange > 1 ? ` Average heart rate was also ${Math.round(benchmark.hrChange)} bpm lower.` : ""}`;
  if (benchmark.changeSeconds != null && Math.abs(benchmark.changeSeconds) <= 3 && benchmark.hrChange != null && benchmark.hrChange >= 3) return `Efficiency win: time held steady while average heart rate improved by ${Math.round(benchmark.hrChange)} bpm.`;
  if (benchmark.status === "Steady") return "Performance is holding steady across comparable efforts.";
  return "More matching efforts will make this trend smarter.";
}

export default function ActivityProgressPage() {
  const [days, setDays] = useState<DailyMetric[]>([]), [activities, setActivities] = useState<CardioActivity[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  useEffect(() => { async function load() { const supabase = createSupabaseBrowserClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) { window.location.href = "/auth"; return; } const [dailyResult, cardioResult] = await Promise.all([supabase.from("health_daily_metrics").select("metric_date,steps,active_energy_kcal").eq("athlete_user_id", user.id).order("metric_date", { ascending: false }).limit(30), supabase.from("cardio_activities").select("id,activity_name,activity_type,started_at,duration_seconds,distance_meters,active_energy_kcal,average_heart_rate_bpm").eq("athlete_user_id", user.id).order("started_at", { ascending: false }).limit(120)]); if (dailyResult.error || cardioResult.error) setError(dailyResult.error?.message ?? cardioResult.error?.message ?? "Could not load activity history."); setDays((dailyResult.data ?? []) as DailyMetric[]); setActivities((cardioResult.data ?? []) as CardioActivity[]); setLoading(false); } void load(); }, []);
  const summary = useMemo(() => { const dayStart = sevenDayStartKey(), recent = days.filter((d) => d.metric_date >= dayStart && d.metric_date <= localDayKey(new Date())), stepDays = recent.filter((d) => d.steps != null), avgSteps = stepDays.length ? Math.round(stepDays.reduce((sum, d) => sum + Number(d.steps ?? 0), 0) / stepDays.length) : null, activity7 = activities.filter((a) => new Date(a.started_at).getTime() >= sevenDayStartTime()), cardio7 = activity7.filter(isCardioActivity), cardioMinutes = Math.round(cardio7.reduce((sum, a) => sum + Number(a.duration_seconds), 0) / 60); return { avgSteps, cardioCount: cardio7.length, cardioMinutes }; }, [days, activities]);
  const comparisons = useMemo(() => new Map(activities.map((activity, index) => [activity.id, comparisonFor(activity, activities.slice(index + 1))])), [activities]);
  const benchmarks = useMemo(() => buildBenchmarks(activities), [activities]);
  const latestWin = activities.map((a) => ({ activity: a, comparison: comparisons.get(a.id) })).find((x) => x.comparison?.status === "better");
  const leadBenchmark = benchmarks[0] ?? null;
  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Activity</p><h1 className="mt-2 text-3xl font-black">Reading the engine...</h1></main>;
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-10">
    <header><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Activity</p><h1 className="mt-2 text-3xl font-black">How&apos;s the engine?</h1><p className="mt-2 text-zinc-400">Cardio, steps, pace, and efficiency without turning your watch into homework.</p></header>
    {error && <p className="rounded-xl border border-[#ff0032]/40 bg-[#ff0032]/5 p-4 text-sm">{error}</p>}

    <section className="rounded-2xl border border-[#ff0032]/50 bg-[#ff0032]/5 p-5">
      <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff0032]">Engine Signal</p>
      {latestWin?.comparison ? <><h2 className="mt-2 text-2xl font-black">Win detected.</h2><p className="mt-3 text-base font-semibold leading-7 text-zinc-200">{latestWin.comparison.message}</p></> : leadBenchmark ? <><h2 className="mt-2 text-2xl font-black">{leadBenchmark.label}: {leadBenchmark.status}</h2><p className="mt-3 text-base font-semibold leading-7 text-zinc-200">{trendSummary(leadBenchmark)}</p></> : <><h2 className="mt-2 text-2xl font-black">Baseline building.</h2><p className="mt-3 text-base font-semibold leading-7 text-zinc-200">Keep logging walks, runs, rides, rows, or swims. PHATBOT will start calling performance trends as comparable efforts appear.</p></>}
    </section>

    <section className="grid grid-cols-3 gap-3"><div className="rounded-2xl border border-zinc-800 p-4"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-zinc-500">Avg Steps</p><p className="mt-2 text-2xl font-black">{summary.avgSteps?.toLocaleString() ?? "—"}</p><p className="mt-1 text-xs text-zinc-600">7 days</p></div><div className="rounded-2xl border border-zinc-800 p-4"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-zinc-500">Cardio</p><p className="mt-2 text-2xl font-black">{summary.cardioCount}</p><p className="mt-1 text-xs text-zinc-600">sessions</p></div><div className="rounded-2xl border border-zinc-800 p-4"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-zinc-500">Minutes</p><p className="mt-2 text-2xl font-black">{summary.cardioMinutes}</p><p className="mt-1 text-xs text-zinc-600">cardio</p></div></section>

    <section><div className="mb-3"><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Cardio Benchmarks</p><h2 className="mt-1 text-xl font-black">Repeatable efforts</h2></div>{benchmarks.length===0?<div className="rounded-2xl border border-zinc-800 p-5"><p className="font-black">No benchmark yet.</p><p className="mt-2 text-sm leading-6 text-zinc-400">A repeatable run, ride, row, or swim will establish one automatically.</p></div>:<div className="grid gap-3">{benchmarks.slice(0,3).map((benchmark)=>{const latestPace=pace(Number(benchmark.activity.duration_seconds),benchmark.activity.distance_meters);return <article key={benchmark.key} className="rounded-2xl border border-zinc-800 p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-black">{benchmark.label}</h3><p className="mt-1 text-xs text-zinc-500">{benchmark.efforts.length} tracked effort{benchmark.efforts.length===1?"":"s"}</p></div><span className="text-xs font-black text-[#ff0032]">{benchmark.status}</span></div><div className="mt-4 grid grid-cols-3 gap-3"><div><p className="text-xs text-zinc-500">Latest</p><p className="mt-1 font-black">{clock(Number(benchmark.activity.duration_seconds))}</p></div><div><p className="text-xs text-zinc-500">Best</p><p className="mt-1 font-black">{clock(Number(benchmark.best.duration_seconds))}</p></div><div><p className="text-xs text-zinc-500">Pace</p><p className="mt-1 font-black">{latestPace??"—"}</p></div></div><p className="mt-4 text-sm leading-6 text-zinc-400">{trendSummary(benchmark)}</p></article>})}</div>}</section>

    <details className="rounded-2xl border border-zinc-900"><summary className="cursor-pointer list-none p-4 text-sm font-bold text-zinc-500">View recent cardio & activity history</summary><div className="border-t border-zinc-900 p-4"><div className="grid gap-3">{activities.length===0?<p className="text-sm text-zinc-500">No synced workouts yet.</p>:activities.slice(0,20).map((activity)=>{const mi=miles(activity.distance_meters),cycling=isCycling(activity),metric=cycling?speedMph(Number(activity.duration_seconds),activity.distance_meters):pace(Number(activity.duration_seconds),activity.distance_meters),comparison=comparisons.get(activity.id);return <article key={activity.id} className="rounded-xl border border-zinc-900 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-black">{benchmarkKey(activity)?.label??activity.activity_name??"Workout"}</p><p className="mt-1 text-xs text-zinc-600">{fmtDate(activity.started_at)}</p></div><p className="font-black">{duration(Number(activity.duration_seconds))}</p></div><p className="mt-3 text-sm text-zinc-400">{mi==null?"":`${mi.toFixed(2)} mi · `}{metric==null?"":cycling?`${metric.toFixed(1)} mph`:metric}{activity.average_heart_rate_bpm==null?"":` · ${Math.round(Number(activity.average_heart_rate_bpm))} bpm`}</p>{comparison&&<p className={`mt-3 text-sm ${comparison.status==="better"?"text-[#ff0032]":"text-zinc-500"}`}>{comparison.message}</p>}</article>})}</div></div></details>

    <details className="rounded-2xl border border-zinc-900"><summary className="cursor-pointer list-none p-4 text-sm font-bold text-zinc-500">View daily steps</summary><div className="border-t border-zinc-900 p-4">{days.length===0?<p className="text-sm text-zinc-500">No synced daily activity yet.</p>:days.slice(0,14).map(day=><div key={day.metric_date} className="flex items-center justify-between border-b border-zinc-900 py-3 last:border-0"><p className="text-sm font-semibold">{fmtDate(`${day.metric_date}T12:00:00`)}</p><p className="font-black">{day.steps==null?"—":Number(day.steps).toLocaleString()}</p></div>)}</div></details>
  </main>;
}
