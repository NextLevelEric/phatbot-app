"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getNativeHealthProvider, requestNativeHealthAccess, type PhatbotHealthProvider } from "@/lib/health";
import { syncNativeHealth, healthSyncSummary, healthSyncErrorMessage } from "@/lib/healthSync";

type State = "idle" | "connecting" | "syncing";

function providerLabel(provider: PhatbotHealthProvider) {
  if (provider === "apple_health") return "Apple Health";
  if (provider === "health_connect") return "Health Connect";
  return "Health";
}

export default function HealthConnectionPanel() {
  const pathname = usePathname();
  const busy = useRef(false);
  const [provider, setProvider] = useState<PhatbotHealthProvider>("none");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (pathname !== "/account") return;
    setProvider(getNativeHealthProvider());
  }, [pathname]);

  if (pathname !== "/account" || provider === "none") return null;

  const label = providerLabel(provider);

  async function sync(authorize = false) {
    if (busy.current) return;
    busy.current = true;
    setState(authorize ? "connecting" : "syncing"); setMessage("");
    try {
      if (authorize) {
        const access = await requestNativeHealthAccess();
        if (!access.authorized) {
          setMessage(`Allow PHATBOT access in ${label}, return here, then tap Sync Health Data.`);
          return;
        }
      }
      setState("syncing");
      const result = await syncNativeHealth(14);
      setMessage(result ? healthSyncSummary(result) : `${label} is not available on this device.`);
    } catch (error) { setMessage(healthSyncErrorMessage(error)); }
    finally { busy.current = false; setState("idle"); }
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
          <button type="button" onClick={() => void sync(true)} disabled={state !== "idle"} className="rounded-xl border border-zinc-700 px-3 py-3 text-xs font-black disabled:opacity-50">
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
