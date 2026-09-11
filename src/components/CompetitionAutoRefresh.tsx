"use client";

import { useEffect, useState } from "react";

const REFRESH_MS = 15 * 60 * 1000;

export default function CompetitionAutoRefresh({ embedded = false }: { embedded?: boolean }) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    setLastUpdated(new Date());
    const timer = window.setInterval(() => window.location.reload(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={embedded ? "mt-3" : "mx-auto max-w-2xl px-4 pt-3 sm:px-6"}>
      <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-zinc-500">
        <span>Current standings · refresh every 15 min</span>
        <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Updating"}</span>
      </div>
    </div>
  );
}
