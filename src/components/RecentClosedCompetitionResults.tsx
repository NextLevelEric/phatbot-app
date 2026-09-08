"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Competition = "beast" | "eager_beaver" | "cardio_bunny" | "step_king";
type Period = { id: string; competition: Competition; period_start: string };
type Winner = { display_name: string; result_label: string | null; score: number };

type ClosedResult = Period & { winner: Winner | null };

const labels: Record<Competition, string> = {
  beast: "Beast",
  eager_beaver: "Eager Beaver",
  cardio_bunny: "Cardio Bunny",
  step_king: "Step King",
};

function fallback(k: Competition, score: number) {
  if (k === "step_king") return `${Math.round(score).toLocaleString()} steps`;
  if (k === "eager_beaver") return `${score.toFixed(1)} Eager`;
  return `${score >= 0 ? "+" : ""}${score.toFixed(1)}%`;
}

export default function RecentClosedCompetitionResults() {
  const [results, setResults] = useState<ClosedResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const s = createSupabaseBrowserClient();
      const { data } = await s
        .from("competition_periods")
        .select("id,competition,period_start")
        .eq("cadence", "daily")
        .eq("status", "finalized")
        .order("period_start", { ascending: false })
        .limit(16);

      const latest = new Map<Competition, Period>();
      for (const p of (data ?? []) as Period[]) if (!latest.has(p.competition)) latest.set(p.competition, p);

      const closed = await Promise.all(Array.from(latest.values()).map(async p => {
        const { data: board } = await s.rpc("competition_leaderboard", { p_period_id: p.id });
        const winner = ((board ?? []) as Array<Winner & { rank: number | null }>).find(r => r.rank === 1) ?? null;
        return { ...p, winner };
      }));
      setResults(closed);
    }
    void load();
  }, []);

  if (!results.length) return null;

  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(results[0].period_start));

  return (
    <section className="mx-auto max-w-2xl px-4 pb-7 sm:px-6">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
        <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between text-left">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Most Recent Closed Results</p>
            <h2 className="mt-1 text-2xl font-black">Final results · {date}</h2>
            <p className="mt-2 text-sm text-zinc-500">Locked results. Hardware has been awarded.</p>
          </div>
          <span className="text-2xl text-zinc-500">{open ? "−" : "+"}</span>
        </button>
        {open && <div className="mt-5 grid gap-2">{results.map(r => <div key={r.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black px-4 py-3"><div><p className="text-xs font-black uppercase tracking-[.12em] text-yellow-500">{labels[r.competition]}</p><p className="mt-1 font-black">{r.winner?.display_name ?? "No eligible winner"}</p></div>{r.winner && <p className="font-black text-zinc-300">{r.winner.result_label ?? fallback(r.competition, r.winner.score)}</p>}</div>)}</div>}
      </div>
    </section>
  );
}
