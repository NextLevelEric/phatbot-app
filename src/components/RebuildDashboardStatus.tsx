"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Stage = "rebuild_started" | "baseline_established" | "rebuilding_progress" | "plateau_cleared";
type RebuildRow = { exercise_id: string; exercise_name: string; stage: Stage; progress_from_rebuild_percent: number | null; recovery_to_pre_rebuild_percent: number | null; post_rebuild_sessions: number; };
type HealthWorkout = { sourceWorkoutId?: string; activityType?: number; activityName?: string; startDate?: string; endDate?: string; durationSeconds?: number; distanceMeters?: number; activeEnergyKcal?: number; averageHeartRateBpm?: number; };
type DailyHealthMetric = { date?: string; steps?: number; activeEnergyKcal?: number; };
type HealthSnapshot = { startDate?: string; endDate?: string; restingHeartRate?: number | null; hrvMs?: number | null; activeEnergyKcal?: number; steps?: number; dailyMetrics?: DailyHealthMetric[]; workouts?: HealthWorkout[]; sleep?: Array<{ startDate?: string; endDate?: string; durationSeconds?: number; value?: number }>; };
type HealthKitBridge = { isAvailable(): Promise<{ available: boolean }>; requestAuthorization(): Promise<{ authorized: boolean }>; getRecentSnapshot(options: { days: number }): Promise<HealthSnapshot>; };
const HealthKit = registerPlugin<HealthKitBridge>("HealthKit");
const HEALTH_CONNECTED_KEY = "phatbot.appleHealth.connected";
const stageLabel: Record<Stage, string> = { rebuild_started: "REBUILD STARTED", baseline_established: "BASELINE ESTABLISHED", rebuilding_progress: "REBUILDING", plateau_cleared: "PLATEAU CLEARED" };
function signedPercent(value: number | null) { if (value === null) return null; return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`; }
function homeSummary(row: RebuildRow) { if (row.stage === "rebuild_started") return "Deliberate reset underway. Clean reps first, then build the load back up."; if (row.stage === "baseline_established") return "Rebuild baseline established. PHATBOT is watching the next sessions for repeatable progress."; if (row.stage === "rebuilding_progress") return row.post_rebuild_sessions < 2 ? "Progress is improving. PHATBOT is waiting for one more confirming session." : "Progress is moving in the right direction. Keep repeating clean, productive work."; return "The rebuild has cleared."; }
function metric(value: number | null | undefined, suffix = "") { if (value === null || value === undefined || Number.isNaN(value)) return "—"; return `${Math.round(value)}${suffix}`; }

async function persistHealthSnapshot(snapshot: HealthSnapshot) {
  const supabase = createSupabaseBrowserClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error("Sign in to save Apple Health data.");
  const workouts = (snapshot.workouts ?? []).filter((workout) => workout.sourceWorkoutId && workout.startDate && workout.endDate && workout.activityType !== undefined && workout.durationSeconds !== undefined);
  if (workouts.length) { const rows = workouts.map((workout) => ({ athlete_user_id: user.id, source: "healthkit", source_workout_id: workout.sourceWorkoutId!, activity_type: workout.activityType!, activity_name: workout.activityName ?? null, started_at: workout.startDate!, ended_at: workout.endDate!, duration_seconds: workout.durationSeconds!, distance_meters: workout.distanceMeters ?? null, active_energy_kcal: workout.activeEnergyKcal ?? null, average_heart_rate_bpm: workout.averageHeartRateBpm ?? null })); const { error } = await supabase.from("cardio_activities").upsert(rows, { onConflict: "athlete_user_id,source,source_workout_id" }); if (error) throw error; }
  const dailyMetrics = (snapshot.dailyMetrics ?? []).filter((day) => day.date);
  if (dailyMetrics.length) { const rows = dailyMetrics.map((day) => ({ athlete_user_id: user.id, metric_date: day.date!, source: "healthkit", steps: day.steps ?? null, active_energy_kcal: day.activeEnergyKcal ?? null })); const { error } = await supabase.from("health_daily_metrics").upsert(rows, { onConflict: "athlete_user_id,metric_date,source" }); if (error) throw error; }
  return { workouts: workouts.length, days: dailyMetrics.length };
}

export function RebuildDashboardStatus() {
  const [rows, setRows] = useState<RebuildRow[]>([]), [healthAvailable, setHealthAvailable] = useState(false), [healthBusy, setHealthBusy] = useState(false), [healthError, setHealthError] = useState<string | null>(null), [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null), [saved, setSaved] = useState<{ workouts: number; days: number } | null>(null), [healthConnected, setHealthConnected] = useState(false);

  async function syncAppleHealth(requestAuthorization: boolean) {
    setHealthBusy(true); setHealthError(null);
    try {
      if (requestAuthorization) { const authorization = await HealthKit.requestAuthorization(); if (!authorization.authorized) throw new Error("Apple Health access was not granted."); localStorage.setItem(HEALTH_CONNECTED_KEY, "1"); setHealthConnected(true); }
      const recent = await HealthKit.getRecentSnapshot({ days: 14 }); const savedResult = await persistHealthSnapshot(recent); setSnapshot(recent); setSaved(savedResult); setHealthConnected(true); localStorage.setItem(HEALTH_CONNECTED_KEY, "1");
    } catch (error) { console.error("Apple Health sync failed", error); setHealthError(error instanceof Error ? error.message : "PHATBOT could not sync Apple Health."); }
    finally { setHealthBusy(false); }
  }

  useEffect(() => { let cancelled = false;
    async function load() { const supabase = createSupabaseBrowserClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user || cancelled) return; const { data, error } = await supabase.from("exercise_rebuild_progress").select("exercise_id,exercise_name,stage,progress_from_rebuild_percent,recovery_to_pre_rebuild_percent,post_rebuild_sessions,updated_at").eq("athlete_user_id", user.id).neq("stage", "plateau_cleared").order("updated_at", { ascending: false }).limit(3); if (!error && !cancelled) setRows((data ?? []) as RebuildRow[]); }
    async function detectHealthKit() { if (Capacitor.getPlatform() !== "ios") return; try { const result = await HealthKit.isAvailable(); if (cancelled) return; setHealthAvailable(result.available); if (result.available && localStorage.getItem(HEALTH_CONNECTED_KEY) === "1") { setHealthConnected(true); void syncAppleHealth(false); } } catch (error) { console.error("HealthKit availability check failed", error); } }
    void load(); void detectHealthKit(); return () => { cancelled = true; };
  }, []);

  return <>
    {healthAvailable && <section className="rounded-2xl border border-zinc-700 bg-zinc-950 p-5"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff0032]">Apple Health Beta</p><div className="mt-2 flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{healthConnected ? "Apple Health Connected" : "Connect Apple Health"}</h2><p className="mt-2 text-sm leading-6 text-zinc-300">{healthConnected ? "PHATBOT can sync your Apple Watch and Health activity history. You do not need to reconnect when you leave this screen." : "Give PHATBOT read-only access to your Apple Watch and Health data so we can build your activity and cardio history."}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wider ${healthConnected ? "bg-emerald-500/10 text-emerald-300" : "border border-zinc-700 text-zinc-300"}`}>{healthConnected ? "CONNECTED" : "TEST"}</span></div>
      {!healthConnected && <button type="button" onClick={() => void syncAppleHealth(true)} disabled={healthBusy} className="mt-4 w-full rounded-lg bg-white px-5 py-3 font-bold text-black disabled:cursor-wait disabled:opacity-60">{healthBusy ? "Connecting Apple Health..." : "Connect Apple Health"}</button>}
      {healthError && <div className="mt-4 rounded-xl border border-[#ff0032]/40 bg-[#ff0032]/5 p-4 text-sm text-zinc-200">{healthError}</div>}
      {healthConnected && <div className="mt-5"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-white">{snapshot ? "Apple Health synced" : "Apple Health connected"}</p><p className="mt-1 text-xs text-zinc-400">{snapshot ? `14-day sync complete. ${saved?.days ?? 0} daily records and ${saved?.workouts ?? 0} workout${saved?.workouts === 1 ? "" : "s"} saved to PHATBOT history.` : "Connection remembered on this device."}</p></div></div>{snapshot && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-xl border border-zinc-800 p-3"><p className="text-xs text-zinc-500">Resting HR</p><p className="mt-1 text-xl font-black">{metric(snapshot.restingHeartRate, " bpm")}</p></div><div className="rounded-xl border border-zinc-800 p-3"><p className="text-xs text-zinc-500">HRV</p><p className="mt-1 text-xl font-black">{metric(snapshot.hrvMs, " ms")}</p></div><div className="rounded-xl border border-zinc-800 p-3"><p className="text-xs text-zinc-500">14-Day Steps</p><p className="mt-1 text-xl font-black">{metric(snapshot.steps)}</p></div><div className="rounded-xl border border-zinc-800 p-3"><p className="text-xs text-zinc-500">Active Energy</p><p className="mt-1 text-xl font-black">{metric(snapshot.activeEnergyKcal, " kcal")}</p></div><div className="rounded-xl border border-zinc-800 p-3"><p className="text-xs text-zinc-500">Workouts</p><p className="mt-1 text-xl font-black">{snapshot.workouts?.length ?? 0}</p></div><div className="rounded-xl border border-zinc-800 p-3"><p className="text-xs text-zinc-500">Daily Records</p><p className="mt-1 text-xl font-black">{snapshot.dailyMetrics?.length ?? 0}</p></div></div>}<button type="button" onClick={() => void syncAppleHealth(false)} disabled={healthBusy} className="mt-4 text-sm font-semibold text-zinc-300 underline disabled:opacity-60">{healthBusy ? "Syncing..." : "Sync Apple Health now"}</button></div>}
    </section>}
    {rows.length > 0 && <section className="flex flex-col gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff0032]">Active PHATBOT Coaching</p><h2 className="mt-1 text-xl font-bold">Rebuilds in progress</h2></div>{rows.map((row) => { const hasMeaningfulProgress = row.post_rebuild_sessions > 0 && row.progress_from_rebuild_percent !== null && Math.abs(row.progress_from_rebuild_percent) >= 0.05; const progress = hasMeaningfulProgress ? signedPercent(row.progress_from_rebuild_percent) : null; return <Link key={row.exercise_id} href={`/progress/exercises?exercise=${encodeURIComponent(row.exercise_id)}`} className="rounded-2xl border border-zinc-700 p-5 transition hover:border-[#ff0032]/60"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Coaching Intervention</p><p className="mt-2 text-lg font-bold">{row.exercise_name}</p></div><span className="shrink-0 rounded-full bg-[#ff0032]/10 px-3 py-1 text-[10px] font-black tracking-wider text-[#ff0032]">{stageLabel[row.stage]}</span></div>{progress && <p className="mt-3 text-sm font-bold text-white">{progress} from rebuild baseline</p>}<p className={`${progress ? "mt-1" : "mt-3"} text-sm leading-6 text-zinc-300`}>{homeSummary(row)}</p><p className="mt-3 text-sm font-semibold">Review exercise →</p></Link>; })}</section>}
  </>;
}
