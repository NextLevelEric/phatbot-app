"use client";

import { useEffect, useMemo, useState } from "react";
import { getNativeHealthProvider, getNativeHealthSnapshot, requestNativeHealthAccess, type PhatbotHealthProvider } from "@/lib/health";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type State = "checking" | "unavailable" | "disconnected" | "connected" | "syncing" | "error";

function providerName(provider: PhatbotHealthProvider) {
  if (provider === "health_connect") return "Health Connect";
  if (provider === "apple_health") return "Apple Health";
  return "Health Data";
}

export default function HealthConnectionCard() {
  const provider = useMemo(() => getNativeHealthProvider(), []);
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const name = providerName(provider);

  useEffect(() => {
    let active = true;
    async function load() {
      if (provider === "none") { if (active) setState("unavailable"); return; }
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase.from("athlete_health_connections").select("last_synced_at").eq("athlete_user_id", user.id).eq("provider", provider).maybeSingle();
      if (!active) return;
      setLastSynced(data?.last_synced_at ?? null);
      setState(data ? "connected" : "disconnected");
    }
    void load();
    const onVisible = () => { if (document.visibilityState === "visible" && provider !== "none") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [provider]);

  async function connect() {
    if (provider === "none") return;
    setMessage("");
    setState("checking");
    try {
      const result = await requestNativeHealthAccess();
      if (result.authorized) {
        await sync();
        return;
      }
      setState("disconnected");
      setMessage(`Finish granting ${name} permissions, then return to PHATBOT and tap Sync Health Data.`);
    } catch (error) {
      setState("error");
      setMessage((error as Error).message || `PHATBOT could not open ${name}.`);
    }
  }

  async function sync() {
    if (provider === "none") return;
    setMessage("");
    setState("syncing");
    try {
      const snapshot = await getNativeHealthSnapshot(14);
      if (!snapshot) throw new Error(`${name} is not available on this device.`);
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again before syncing health data.");
      const now = new Date().toISOString();
      const today = new Date().toLocaleDateString("en-CA");
      const daily = (snapshot.dailyMetrics ?? []).map(row => ({ athlete_user_id: user.id, provider, metric_date: row.date, steps: row.steps ?? null, active_energy_kcal: row.activeEnergyKcal ?? null, updated_at: now }));
      const todayIndex = daily.findIndex(row => row.metric_date === today);
      const latest = { resting_heart_rate_bpm: snapshot.restingHeartRate ?? null, hrv_ms: snapshot.hrvMs ?? null, weight_kg: snapshot.weightKg ?? null };
      if (todayIndex >= 0) Object.assign(daily[todayIndex], latest);
      else daily.push({ athlete_user_id: user.id, provider, metric_date: today, steps: null, active_energy_kcal: null, updated_at: now, ...latest } as typeof daily[number]);
      const workouts = (snapshot.workouts ?? []).map(row => ({ athlete_user_id: user.id, provider, source_workout_id: row.sourceWorkoutId, activity_type: row.activityType ?? null, activity_name: row.activityName ?? null, started_at: row.startDate, ended_at: row.endDate, duration_seconds: row.durationSeconds, distance_meters: row.distanceMeters ?? null, active_energy_kcal: row.activeEnergyKcal ?? null, average_heart_rate_bpm: row.averageHeartRateBpm ?? null, updated_at: now }));
      const sleep = (snapshot.sleep ?? []).map(row => ({ athlete_user_id: user.id, provider, started_at: row.startDate, ended_at: row.endDate, duration_seconds: row.durationSeconds, source_value: row.value ?? null, updated_at: now }));
      const results = await Promise.all([
        daily.length ? supabase.from("athlete_health_daily_metrics").upsert(daily, { onConflict: "athlete_user_id,provider,metric_date" }) : Promise.resolve({ error: null }),
        workouts.length ? supabase.from("athlete_health_workouts").upsert(workouts, { onConflict: "athlete_user_id,provider,source_workout_id" }) : Promise.resolve({ error: null }),
        sleep.length ? supabase.from("athlete_health_sleep_sessions").upsert(sleep, { onConflict: "athlete_user_id,provider,started_at,ended_at" }) : Promise.resolve({ error: null }),
        supabase.from("athlete_health_connections").upsert({ athlete_user_id: user.id, provider, connected_at: now, last_synced_at: now, updated_at: now }, { onConflict: "athlete_user_id" })
      ]);
      const failure = results.find(result => result.error)?.error;
      if (failure) throw failure;
      setLastSynced(now);
      setState("connected");
      setMessage(`Beep boop. Synced ${daily.length} daily records, ${workouts.length} workouts, and ${sleep.length} sleep sessions from ${name}.`);
    } catch (error) {
      setState("error");
      const text = (error as Error).message || `PHATBOT could not sync ${name}.`;
      setMessage(text.includes("permission") ? `${name} permission is not complete yet. Open ${name}, allow PHATBOT access, then come back and tap Sync Health Data.` : text);
    }
  }

  if (state === "unavailable") return null;
  return <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 p-5">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Health & Wearables</p><h2 className="mt-1 text-xl font-semibold">{name}</h2><p className="mt-1 text-sm text-zinc-400">Bring steps, cardio, heart rate, sleep, calories, and body-weight data into PHATBOT.</p></div><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${state === "connected" ? "bg-emerald-400" : state === "error" ? "bg-amber-400" : "bg-zinc-600"}`} /></div>
    {lastSynced && <p className="text-xs text-zinc-500">Last synced {new Date(lastSynced).toLocaleString()}</p>}
    <div className="grid gap-2 sm:grid-cols-2">{state === "disconnected" || state === "error" ? <button type="button" onClick={() => void connect()} className="phat-accent-bg rounded-lg px-4 py-3 font-semibold">Connect {name}</button> : null}<button type="button" disabled={state === "checking" || state === "syncing"} onClick={() => void sync()} className="rounded-lg border border-zinc-700 px-4 py-3 font-semibold disabled:opacity-50">{state === "syncing" ? "Syncing..." : "Sync Health Data"}</button></div>
    {message && <p className="phat-signal rounded-lg border p-3 text-sm text-zinc-200">{message}</p>}
    <p className="text-xs leading-5 text-zinc-500">PHATBOT reads only the health categories you approve. You can change access later in {name} settings.</p>
  </section>;
}
