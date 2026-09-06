"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getNativeHealthProvider, requestNativeHealthAccess, type PhatbotHealthProvider } from "@/lib/health";
import { syncNativeHealth } from "@/lib/healthSync";

type State = "idle" | "connecting" | "syncing";

function providerLabel(provider: PhatbotHealthProvider) {
  if (provider === "apple_health") return "Apple Health";
  if (provider === "health_connect") return "Health Connect";
  return "Health";
}

export default function HealthConnectionPanel() {
  const pathname = usePathname();
  const [provider, setProvider] = useState<PhatbotHealthProvider>("none");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (pathname !== "/account") return;
    setProvider(getNativeHealthProvider());
  }, [pathname]);

  if (pathname !== "/account" || provider === "none") return null;

  const label = providerLabel(provider);

  async function connect() {
    setState("connecting");
    setMessage("");
    try {
      const result = await requestNativeHealthAccess();
      if (result.authorized) {
        setMessage(`${label} connected. Sync when you're ready.`);
      } else if ("requested" in result && result.requested) {
        setMessage(`PHATBOT opened ${label} permissions. Allow the requested data, return to PHATBOT, then tap Sync Health Data.`);
      } else {
        setMessage(`${label} access was not granted.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `PHATBOT could not connect to ${label}.`);
    } finally {
      setState("idle");
    }
  }

  async function sync() {
    setState("syncing");
    setMessage("");
    try {
      const result = await syncNativeHealth(14);
      if (!result) {
        setMessage(`${label} is not available yet. Connect it first, then try again.`);
      } else {
        setMessage(`Beep boop. Synced ${result.dailyMetrics} days and ${result.workouts} workouts from ${label}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `PHATBOT could not sync ${label}.`);
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 px-4 sm:bottom-5">
      <section className="pointer-events-auto mx-auto max-w-xl rounded-2xl border border-zinc-800 bg-[#090909]/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-start gap-3">
          <img src="/branding/PHATbot%20ICON.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#ff0032]">PHATBOT Health</p>
            <h2 className="mt-1 text-base font-black">Connect {label}</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-400">Bring steps, cardio, heart rate, calories, sleep, and recovery signals into PHATBOT.</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void connect()} disabled={state !== "idle"} className="rounded-xl border border-zinc-700 px-3 py-3 text-xs font-black disabled:opacity-50">
            {state === "connecting" ? "CONNECTING…" : `CONNECT ${label.toUpperCase()}`}
          </button>
          <button type="button" onClick={() => void sync()} disabled={state !== "idle"} className="rounded-xl bg-[#ff0032] px-3 py-3 text-xs font-black text-white disabled:opacity-50">
            {state === "syncing" ? "SYNCING…" : "SYNC HEALTH DATA"}
          </button>
        </div>
        {message && <p className="mt-3 rounded-xl border border-zinc-800 bg-black/30 p-3 text-xs leading-5 text-zinc-300">{message}</p>}
      </section>
    </div>
  );
}
