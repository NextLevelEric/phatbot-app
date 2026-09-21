"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getNativeHealthProvider, requestNativeHealthAccess, type PhatbotHealthProvider } from "@/lib/health";
import { createSupabaseBrowserClient } from "@/lib/supabase";

import { syncNativeHealth, healthSyncSummary, healthSyncErrorMessage } from "@/lib/healthSync";

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
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (provider === "none") { if (active) setState("unavailable"); return; }
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || busy.current) return;
      if (!user) { setState("disconnected"); return; }
      const { data, error } = await supabase.from("athlete_health_connections").select("last_synced_at").eq("athlete_user_id", user.id).eq("provider", provider).maybeSingle();
      if (!active || busy.current) return;
      if (error) { setState("error"); setMessage("Health connection history could not load. You can still try syncing."); return; }
      setLastSynced(data?.last_synced_at ?? null);
      setState(data ? "connected" : "disconnected");
    }
    const reload = () => { if (!busy.current) void load().catch(() => { if (active && !busy.current) { setState("error"); setMessage("Health connection history could not load. Try again."); } }); };
    reload();
    const onVisible = () => { if (document.visibilityState === "visible" && provider !== "none") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [provider]);

  async function sync(authorize = false) {
    if (provider === "none" || busy.current) return;
    busy.current = true;
    setMessage("");
    setState(authorize ? "checking" : "syncing");
    try {
      if (authorize) {
        const access = await requestNativeHealthAccess();
        if (!access.authorized) {
          setState("disconnected");
          setMessage(`Allow PHATBOT to read workouts, steps, and distance in ${name}, then return and tap Sync Health Data.`);
          return;
        }
      }
      setState("syncing");
      const result = await syncNativeHealth(14);
      if (!result) { setState("disconnected"); setMessage(`${name} is unavailable on this device.`); return; }
      setState(result.status === "synced" ? "connected" : "disconnected");
      if (result.syncedAt) setLastSynced(result.syncedAt);
      setMessage(healthSyncSummary(result));
    } catch (error) {
      setState("error"); setMessage(healthSyncErrorMessage(error));
    } finally { busy.current = false; }
  }

  if (state === "unavailable") return null;
  return <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 p-5">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Health & Wearables</p><h2 className="mt-1 text-xl font-semibold">{name}</h2><p className="mt-1 text-sm text-zinc-400">Bring steps, cardio, heart rate, sleep, and calories into PHATBOT.</p></div><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${state === "connected" ? "bg-emerald-400" : state === "error" ? "bg-amber-400" : "bg-zinc-600"}`} /></div>
    {lastSynced && <p className="text-xs text-zinc-500">Last recorded sync {new Date(lastSynced).toLocaleString()}</p>}
    <div className="grid gap-2 sm:grid-cols-2">{state === "disconnected" || state === "error" ? <button type="button" onClick={() => void sync(true)} className="phat-accent-bg rounded-lg px-4 py-3 font-semibold">Connect {name}</button> : null}<button type="button" disabled={state === "checking" || state === "syncing"} onClick={() => void sync()} className="rounded-lg border border-zinc-700 px-4 py-3 font-semibold disabled:opacity-50">{state === "syncing" ? "Syncing..." : "Sync Health Data"}</button></div>
    {message && <p className="phat-signal rounded-lg border p-3 text-sm text-zinc-200">{message}</p>}
    <p className="text-xs leading-5 text-zinc-500">PHATBOT reads only the health categories you approve. You can change access later in {name} settings.</p>
  </section>;
}
