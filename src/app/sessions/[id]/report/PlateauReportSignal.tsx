"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type PlateauSignal = {
  exercise_id: string;
  exercise_name: string;
  consecutive_flat_sessions: number;
  change_percent: number | null;
};

export default function PlateauReportSignal({ sessionId }: { sessionId: string }) {
  const [signals, setSignals] = useState<PlateauSignal[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    async function load() {
      const { data: exerciseRows, error: exerciseError } = await supabase
        .from("exercise_sessions")
        .select("exercise_id")
        .eq("workout_session_id", sessionId);

      if (exerciseError || !exerciseRows?.length || cancelled) return;
      const exerciseIds = Array.from(new Set(exerciseRows.map((row) => row.exercise_id)));
      const { data, error } = await supabase
        .from("exercise_plateau_signals")
        .select("exercise_id,exercise_name,consecutive_flat_sessions,change_percent")
        .eq("status", "active")
        .in("exercise_id", exerciseIds)
        .order("consecutive_flat_sessions", { ascending: false });

      if (!error && !cancelled) setSignals((data ?? []) as PlateauSignal[]);
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  if (!signals.length) return null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 sm:px-6">
      <section className="overflow-hidden rounded-2xl border border-[#ff0032]/45 bg-gradient-to-br from-[#ff0032]/10 to-zinc-950 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[#ff0032]/35 bg-black sm:h-16 sm:w-16">
            <Image
              src="/branding/Head%20of%20PHAT%20BOT.png"
              alt="PHATBOT"
              fill
              sizes="64px"
              className="object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Follow-Up Signal</p>
            <h2 className="mt-2 text-xl font-black sm:text-2xl">Plateau detected. I&apos;m paying attention.</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              This is not a failed workout. It is a pattern worth coaching. I&apos;ll have a controlled rebuild recommendation waiting the next time {signals.length === 1 ? "this exercise appears" : "these exercises appear"}.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          {signals.map((signal) => (
            <div key={signal.exercise_id} className="rounded-xl border border-zinc-800 bg-black/35 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-white">{signal.exercise_name}</p>
                <span className="rounded-full bg-[#ff0032]/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-[#ff0032]">
                  {signal.consecutive_flat_sessions} flat sessions
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {signal.change_percent === null
                  ? "Performance has remained inside the same range."
                  : `Recent best strength signal: ${signal.change_percent >= 0 ? "+" : ""}${Number(signal.change_percent).toFixed(1)}% vs. the pre-plateau baseline.`}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm font-semibold text-zinc-200">🤖 Next mission: adjust, rebuild clean reps, then make the machine move again.</p>
      </section>
    </div>
  );
}
