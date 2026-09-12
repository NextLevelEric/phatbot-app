"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatBodyweight, type BodyweightMeasurement } from "@/features/bodyweight/bodyweight";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Measurement = Pick<BodyweightMeasurement, "id" | "weight_value" | "unit" | "measured_at" | "source">;

function sourceLabel(source: Measurement["source"]) {
  if (source === "apple_health") return "Apple Health";
  if (source === "health_connect") return "Health Connect";
  return "Manual entry";
}

export default function BodyweightHistoryPage() {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          window.location.href = "/auth";
          return;
        }
        const { data, error } = await supabase.from("bodyweight_measurements")
          .select("id,weight_value,unit,measured_at,source")
          .eq("athlete_user_id", user.id)
          .order("measured_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(100);
        if (!active) return;
        if (error) setFailed(true);
        else setMeasurements((data ?? []) as Measurement[]);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-10">
    <header>
      <Link href="/progress" className="text-sm font-black text-zinc-400">← Progress</Link>
      <p className="mt-5 text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Progress</p>
      <h1 className="mt-2 text-3xl font-black">Body Weight</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-400">Your recent measurements, newest first. Multiple intentional entries on the same day stay in your history.</p>
    </header>

    {loading ? <section className="rounded-2xl border border-zinc-800 p-5 text-zinc-500">Reading your weight history…</section>
      : failed ? <section className="rounded-2xl border border-[#ff0032]/40 bg-[#ff0032]/5 p-5"><h2 className="font-black">Weight history is unavailable.</h2><p className="mt-2 text-sm text-zinc-400">PHATBOT could not load these measurements. Your saved data has not been changed.</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl border border-zinc-700 px-4 py-2 text-sm font-black">Try again</button></section>
      : measurements.length === 0 ? <section className="rounded-2xl border border-zinc-800 p-5"><h2 className="font-black">No measurements yet.</h2><p className="mt-2 text-sm text-zinc-500">Use Log weight on Home to create your first entry.</p><Link href="/" className="mt-4 inline-block text-sm font-black text-[#ff0032]">Go to Home →</Link></section>
      : <section aria-labelledby="recent-weight-history" className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="border-b border-zinc-800 px-5 py-4"><h2 id="recent-weight-history" className="font-black">Recent measurements</h2><p className="mt-1 text-xs text-zinc-600">{measurements.length} entr{measurements.length === 1 ? "y" : "ies"}</p></div>
        {measurements.map(measurement => <article key={measurement.id} className="flex items-center justify-between gap-4 border-b border-zinc-900 px-5 py-4 last:border-0">
          <div><p className="text-sm font-bold">{new Date(measurement.measured_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p><p className="mt-1 text-xs text-zinc-600">{new Date(measurement.measured_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · {sourceLabel(measurement.source)}</p></div>
          <p className="text-xl font-black">{formatBodyweight(Number(measurement.weight_value), measurement.unit)}</p>
        </article>)}
      </section>}
  </main>;
}
