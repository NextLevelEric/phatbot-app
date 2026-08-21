"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const MODE_KEY = "phatbot:preferred-mode";
type Mode = "athlete" | "coach";

export default function RoleModeSwitcher() {
  const pathname = usePathname();
  const [dualRole, setDualRole] = useState(false);
  const [loading, setLoading] = useState(true);

  const isAuth = pathname.startsWith("/auth");
  const currentMode: Mode = pathname.startsWith("/coach") ? "coach" : "athlete";

  useEffect(() => {
    if (isAuth) { setLoading(false); return; }
    let active = true;
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) { setLoading(false); return; }
      const [{ data: coach }, { data: athlete }] = await Promise.all([
        supabase.from("coach_profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
        supabase.from("athlete_profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
      ]);
      const both = Boolean(coach && athlete);
      if (active) {
        setDualRole(both);
        setLoading(false);
        if (both) {
          try { localStorage.setItem(MODE_KEY, currentMode); } catch {}
        }
      }
    })();
    return () => { active = false; };
  }, [currentMode, isAuth]);

  function switchMode(mode: Mode) {
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    window.location.href = mode === "coach" ? "/coach" : "/";
  }

  if (loading || isAuth || !dualRole) return null;

  return (
    <div className="sticky top-0 z-50 border-b border-zinc-800 bg-black/95 px-3 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <img src="/branding/PHATbot%20ICON.png" alt="PHATBOT" className="h-8 w-8 shrink-0 object-contain" />
          <p className="min-w-0 text-xs font-semibold uppercase tracking-[.16em] text-zinc-500">PHATBOT Mode</p>
        </div>
        <div className="flex shrink-0 rounded-lg border border-zinc-700 p-1 text-xs font-bold">
          <button type="button" onClick={() => switchMode("athlete")} className={`whitespace-nowrap rounded-md px-3 py-2 transition-colors ${currentMode === "athlete" ? "phat-accent-bg" : "text-zinc-300 hover:text-white"}`} aria-pressed={currentMode === "athlete"}>Athlete View</button>
          <button type="button" onClick={() => switchMode("coach")} className={`whitespace-nowrap rounded-md px-3 py-2 transition-colors ${currentMode === "coach" ? "phat-accent-bg" : "text-zinc-300 hover:text-white"}`} aria-pressed={currentMode === "coach"}>Coach View</button>
        </div>
      </div>
    </div>
  );
}
