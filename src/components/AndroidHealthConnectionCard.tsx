"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getHealthConnectStatus, healthConnectStatusMessage, onHealthConnectResume, openHealthConnectSettings, requestHealthConnectAccess, type HealthConnectStatus } from "@/lib/healthconnect";
import { syncNativeHealth, healthSyncErrorMessage, healthSyncSummary } from "@/lib/healthSync";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function AndroidHealthConnectionCard() {
  const [status, setStatus] = useState<HealthConnectStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [latestWorkoutId, setLatestWorkoutId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const statusRevision = useRef(0);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (inFlight.current) return;
      const request = ++statusRevision.current;
      try {
        const next = await getHealthConnectStatus();
        if (active && request === statusRevision.current && !inFlight.current) { setStatus(next); setMessage(""); }
      } catch {
        if (active && request === statusRevision.current && !inFlight.current) {
          setStatus(null);
          setMessage("Health Connect status could not load. Try again. If you have an older PHATBOT Android build, install the current build to use these controls. Saved history is safe.");
        }
      } finally { if (active && request === statusRevision.current) setChecking(false); }
    }
    void refresh();
    async function loadHistory() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("athlete_health_connections").select("last_synced_at").eq("athlete_user_id", user.id).eq("provider", "health_connect").maybeSingle();
      if (active) setLastSynced(data?.last_synced_at ?? null);
    }
    void loadHistory().catch(() => {}); // Historical timestamp is optional, never permission authority.
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    const listener = onHealthConnectResume(() => void refresh()).catch(() => null);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
      void listener.then(handle => handle?.remove());
    };
  }, []);

  async function perform(action: 'connect' | 'sync' | 'settings' | 'refresh') {
    if (inFlight.current) return;
    inFlight.current = true;
    statusRevision.current += 1;
    setBusy(true);
    setMessage("");
    try {
      if (action === 'settings') { await openHealthConnectSettings(); return; }
      if (action === 'connect') {
        // Authenticate before offering consent; never send data for a stale/missing account.
        const { data: { user } } = await createSupabaseBrowserClient().auth.getUser();
        if (!user) { setMessage("Sign in to PHATBOT before connecting health data."); return; }
        const access = await requestHealthConnectAccess();
        if (!access.authorized) {
          setMessage("No new sync was started. You can decline access, or choose categories in Health Connect settings and try again.");
          return;
        }
      }
      const current = await getHealthConnectStatus();
      setStatus(current);
      if (action === 'refresh') return;
      if (!current?.available || !current.consented || !current.authorized) {
        setMessage("Review data use and approve at least one category before syncing. Saved history is safe.");
        return;
      }
      const result = await syncNativeHealth(14);
      if (!result) { setMessage("Health Connect is unavailable. Your saved history is safe."); return; }
      setMessage(healthSyncSummary(result));
      if (result.syncedAt) setLastSynced(result.syncedAt);
      setLatestWorkoutId(result.latestWorkoutId);
    } catch (error) {
      setMessage(action === 'settings'
        ? "Could not open Health Connect. Open Android Settings and search for Health Connect, or use Google Play to install/update it on Android 9–13."
        : healthSyncErrorMessage(error));
    } finally {
      // Permission screens and settings may have changed grants while this action was in flight.
      try { setStatus(await getHealthConnectStatus()); } catch { setStatus(null); }
      inFlight.current = false;
      setBusy(false);
      setChecking(false);
    }
  }

  const disabled = checking || busy;
  return <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 p-5">
    <div><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Health &amp; Wearables</p><h2 className="mt-1 text-xl font-semibold">Health Connect</h2></div>
    <p className="text-sm leading-6 text-zinc-400">PHATBOT requests read-only access to steps, active calories, exercise sessions, distance, heart rate, and sleep sessions. When you sync, approved data is sent to PHATBOT and stored with your account in its Supabase backend for activity history, cardio reports, daily progress, sleep records, and existing competition calculations.</p>
    <p className="text-xs leading-5 text-zinc-500">You can choose individual categories or decline. No Health Connect writes or background reads. Revoking access stops new reads; previously saved PHATBOT history remains until deleted. <a href="https://app.phatbotfit.com/privacy" className="underline">Read the PHATBOT privacy policy</a>.</p>
    <p role="status" className="text-sm text-zinc-300">{checking ? "Checking Health Connect…" : status ? healthConnectStatusMessage(status) : "Health Connect status is unknown."}</p>
    {lastSynced && <p className="text-xs text-zinc-500">Last recorded sync {new Date(lastSynced).toLocaleString()} · This does not indicate current permission access.</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {status?.available && (!status.consented || !status.allGranted) && <button type="button" disabled={disabled} onClick={() => void perform('connect')} className="phat-accent-bg rounded-lg px-4 py-3 font-semibold disabled:opacity-50">{status.consented ? "Choose read access" : "Review & connect"}</button>}
      {status?.available && status.consented && status.authorized && <button type="button" disabled={disabled} onClick={() => void perform('sync')} className="rounded-lg border border-zinc-700 px-4 py-3 font-semibold disabled:opacity-50">{busy ? "Working…" : "Sync Health Data"}</button>}
      {status && status.recovery !== 'none' && <button type="button" disabled={disabled} onClick={() => void perform('settings')} className="rounded-lg border border-zinc-700 px-4 py-3 font-semibold disabled:opacity-50">{status.recovery === 'install' ? "Install / update Health Connect" : "Health Connect settings"}</button>}
      <button type="button" disabled={disabled} onClick={() => void perform('refresh')} className="rounded-lg border border-zinc-700 px-4 py-3 font-semibold disabled:opacity-50">Check access again</button>
    </div>
    {message && <p role="status" className="phat-signal rounded-lg border p-3 text-sm text-zinc-200">{message}</p>}
    {latestWorkoutId && <Link href={`/progress/activity/${latestWorkoutId}`} className="phat-accent-bg rounded-lg px-4 py-3 text-center font-semibold">View Latest Cardio Report →</Link>}
  </section>;
}
