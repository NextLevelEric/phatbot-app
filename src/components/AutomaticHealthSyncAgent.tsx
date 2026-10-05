"use client";

import { useEffect, useRef } from "react";
import { getNativeHealthProvider } from "@/lib/health";
import { syncNativeHealth } from "@/lib/healthSync";

const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const LAST_ATTEMPT_KEY = "phatbot.healthSync.lastAutomaticAttempt";

function recentlyAttempted(now = Date.now()) {
  try {
    const value = Number(window.localStorage.getItem(LAST_ATTEMPT_KEY));
    return Number.isFinite(value) && value > 0 && now - value < MIN_SYNC_INTERVAL_MS;
  } catch {
    return false;
  }
}

function rememberAttempt(now = Date.now()) {
  try { window.localStorage.setItem(LAST_ATTEMPT_KEY, String(now)); } catch {}
}

/**
 * Best-effort foreground health refresh.
 *
 * Native health stores remain the authority. This agent never requests new
 * permissions and never blocks app startup; athletes can still use the manual
 * Sync Health Data control for permission recovery and troubleshooting.
 */
export default function AutomaticHealthSyncAgent() {
  const running = useRef(false);

  useEffect(() => {
    if (getNativeHealthProvider() === "none") return;

    async function attempt() {
      if (running.current || document.visibilityState !== "visible" || recentlyAttempted()) return;
      running.current = true;
      rememberAttempt();
      try {
        await syncNativeHealth(14);
      } catch {
        // Background refresh must not interrupt training/navigation. Manual
        // health controls expose actionable errors when an athlete needs them.
      } finally {
        running.current = false;
      }
    }

    void attempt();
    const onVisible = () => { if (document.visibilityState === "visible") void attempt(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, []);

  return null;
}
