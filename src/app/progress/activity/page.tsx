"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type DailyMetric = { metric_date: string; steps: number | null; active_energy_kcal: number | null };
type CardioActivity = { id: string; activity_name: string | null; activity_type: number; started_at: string; duration_seconds: number; distance_meters: number | null; active_energy_kcal: number | null; average_heart_rate_bpm: number | null };

function miles(meters: number | null) { return meters == null ? null : meters / 1609.344; }
function duration(seconds: number) { const mins = Math.round(seconds / 60); const h = Math.floor(mins / 60); const m = mins % 60; return h ? `${h}h ${m}m` : `${m} min`; }
function pace(seconds: number, meters: number | null) { const mi = miles(meters); if (!mi || mi <= 0) return null; const secPerMile = seconds / mi; const mins = Math.floor(secPerMile / 60); const secs = Math.round(secPerMile % 60); return `${mins}:${String(secs).padStart(2, "0")}/mi`; }
function fmtDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }

export default function ActivityProgressPage() {
  const [days, setDays] = useState<DailyMetric[]>([]);
  const [activities, setActivities] = useState<CardioActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const [dailyResult, cardioResult] = await Promise.all([
        supabase.from("health_daily_metrics").select("metric_date,steps,active_energy_kcal").eq("athlete_user_id", user.id).order("metric_date", { ascending: false }).limit(30),
        supabase.from("cardio_activities").select("id,activity_name,activity_type,started_at,duration_seconds,distance_meters,active_energy_kcal,average_heart_rate_bpm").eq("athlete_user_id", user.id).order("started_at", { ascending: false }).limit(30),
      ]);
      if (dailyResult.error || cardioResult.error) setError(dailyResult.error?.message ?? cardioResult.error?.message ?? "Could not load activity history.");
      setDays((dailyResult.data ?? []) as DailyMetric[]);
      setActivities((cardioResult.data ?? []) as CardioActivity[]);
      setLoading(false);
    }
    void load();
  }, []);

  const summary = useMemo(() => {
    const recent = days.slice(0, 7);
    const stepDays = recent.filter((d) => d.steps != null);
    const avgSteps = stepDays.length ? Math.round(stepDays.reduce((sum, d) => sum + Number(d.steps ?? 0), 0) / stepDays.length) : null;
    const totalActive = recent.reduce((sum, d) => sum + Number(d.active_energy_kcal ?? 0), 0);
    const cardio7 = activities.filter((a) => Date.now() - new Date(a.started_at).getTime() <= 7 * 86400000);
    const cardioMinutes = Math.round(cardio7.reduce((sum, a) => sum + Number(a.duration_seconds), 0) / 60);
    return { avgSteps, totalActive: Math.round(totalActive), cardioCount: cardio7.length, cardioMinutes };
  }, [days, activities]);

  if (loading) return <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-zinc-300">Beep boop... loading activity history.</main>;

  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
    <header>
      <p className="phat-accent text-sm font-semibold uppercase tracking-[.25em]">PHATBOT Activity</p>
      <h1 className="mt-2 text-3xl font-bold">Activity & cardio history</h1>
      <p className="mt-2 text-zinc-400">Apple Health activity, walks, runs, rides, and other tracked workouts collected by PHATBOT.</p>
    </header>

    {error && <p className="rounded-xl border border-[#ff0032]/40 bg-[#ff0032]/5 p-4 text-sm">{error}</p>}

    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-zinc-800 p-4"><p className="text-xs text-zinc-500">7-day avg steps</p><p className="mt-2 text-2xl font-black">{summary.avgSteps?.toLocaleString() ?? "—"}</p></div>
      <div className="rounded-xl border border-zinc-800 p-4"><p className="text-xs text-zinc-500">7-day active kcal</p><p className="mt-2 text-2xl font-black">{summary.totalActive.toLocaleString()}</p></div>
      <div className="rounded-xl border border-zinc-800 p-4"><p className="text-xs text-zinc-500">7-day cardio</p><p className="mt-2 text-2xl font-black">{summary.cardioCount}</p></div>
      <div className="rounded-xl border border-zinc-800 p-4"><p className="text-xs text-zinc-500">Cardio minutes</p><p className="mt-2 text-2xl font-black">{summary.cardioMinutes}</p></div>
    </section>

    <section className="rounded-2xl border border-zinc-800 p-5">
      <div><p className="phat-accent text-xs font-bold uppercase tracking-[.2em]">Daily Activity</p><h2 className="mt-1 text-xl font-bold">Steps & active energy</h2></div>
      <div className="mt-4 flex flex-col gap-2">
        {days.length === 0 && <p className="text-sm text-zinc-500">No daily Apple Health history has been synced yet.</p>}
        {days.slice(0, 14).map((day) => <div key={day.metric_date} className="flex items-center justify-between rounded-xl border border-zinc-900 px-4 py-3">
          <p className="font-semibold">{fmtDate(`${day.metric_date}T12:00:00`)}</p>
          <div className="text-right"><p className="font-bold">{day.steps == null ? "—" : `${Number(day.steps).toLocaleString()} steps`}</p><p className="text-xs text-zinc-500">{day.active_energy_kcal == null ? "—" : `${Math.round(Number(day.active_energy_kcal))} active kcal`}</p></div>
        </div>)}
      </div>
    </section>

    <section className="rounded-2xl border border-zinc-800 p-5">
      <div><p className="phat-accent text-xs font-bold uppercase tracking-[.2em]">Cardio Log</p><h2 className="mt-1 text-xl font-bold">Recent tracked workouts</h2></div>
      <div className="mt-4 flex flex-col gap-3">
        {activities.length === 0 && <p className="text-sm text-zinc-500">No Apple Health workouts have been synced yet.</p>}
        {activities.map((activity) => { const mi = miles(activity.distance_meters); const workoutPace = pace(Number(activity.duration_seconds), activity.distance_meters); return <article key={activity.id} className="rounded-xl border border-zinc-800 p-4">
          <div className="flex items-start justify-between gap-4"><div><p className="text-lg font-bold">{activity.activity_name ?? "Cardio Workout"}</p><p className="mt-1 text-xs text-zinc-500">{fmtDate(activity.started_at)}</p></div><p className="font-bold">{duration(Number(activity.duration_seconds))}</p></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><p className="text-xs text-zinc-500">Distance</p><p className="mt-1 font-semibold">{mi == null ? "—" : `${mi.toFixed(2)} mi`}</p></div>
            <div><p className="text-xs text-zinc-500">Pace</p><p className="mt-1 font-semibold">{workoutPace ?? "—"}</p></div>
            <div><p className="text-xs text-zinc-500">Avg HR</p><p className="mt-1 font-semibold">{activity.average_heart_rate_bpm == null ? "—" : `${Math.round(Number(activity.average_heart_rate_bpm))} bpm`}</p></div>
            <div><p className="text-xs text-zinc-500">Active kcal</p><p className="mt-1 font-semibold">{activity.active_energy_kcal == null ? "—" : Math.round(Number(activity.active_energy_kcal))}</p></div>
          </div>
        </article>; })}
      </div>
    </section>

    <div className="grid gap-3 sm:grid-cols-2"><Link href="/progress" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">Back to Progress</Link><Link href="/" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">Dashboard</Link></div>
  </main>;
}
