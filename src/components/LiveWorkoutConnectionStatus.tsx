"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function LiveWorkoutConnectionStatus() {
  const pathname = usePathname();
  const [online, setOnline] = useState(true);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOffline = () => {
      setOnline(false);
      setRestored(false);
    };
    const handleOnline = () => {
      setOnline(true);
      setRestored(true);
      window.setTimeout(() => setRestored(false), 3500);
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!/^\/sessions\/[^/]+$/.test(pathname)) return null;

  if (!online) {
    return (
      <div className="fixed inset-x-3 top-3 z-[100] mx-auto max-w-xl rounded-xl border border-[#ff0032]/60 bg-black/95 px-4 py-3 shadow-2xl backdrop-blur">
        <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff0032]">Connection lost</p>
        <p className="mt-1 text-sm text-zinc-200">PHATBOT is offline. Do not re-enter a set until your connection returns and the workout reloads.</p>
      </div>
    );
  }

  if (restored) {
    return (
      <div className="fixed inset-x-3 top-3 z-[100] mx-auto max-w-xl rounded-xl border border-zinc-700 bg-black/95 px-4 py-3 shadow-2xl backdrop-blur">
        <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-300">Connection restored</p>
        <p className="mt-1 text-sm text-zinc-200">PHATBOT is back online. Refresh the workout if the latest saved set is not visible.</p>
      </div>
    );
  }

  return null;
}
