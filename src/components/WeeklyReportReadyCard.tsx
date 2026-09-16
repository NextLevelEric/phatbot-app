"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type ReadyReport = { id: string; finalized_at: string; report_payload: { summary?: { headline?: string } } };

export default function WeeklyReportReadyCard({ athleteUserId }: { athleteUserId: string }) {
  const [report, setReport] = useState<ReadyReport | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
      const { data, error } = await createSupabaseBrowserClient().from("weekly_progress_reports")
        .select("id,finalized_at,report_payload").eq("athlete_user_id", athleteUserId)
        .gte("finalized_at", cutoff).order("finalized_at", { ascending: false }).limit(1).maybeSingle();
      if (mounted && !error) setReport(data as unknown as ReadyReport | null);
    }
    void load();
    return () => { mounted = false; };
  }, [athleteUserId]);

  if (!report) return null;
  return <Link href="/weekly" className="block rounded-2xl border border-[#ff0032]/45 bg-[#ff0032]/5 p-5 transition active:scale-[.99]"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Your weekly report is ready</p><div className="mt-2 flex items-center justify-between gap-4"><p className="font-black">{report.report_payload.summary?.headline ?? "See your week in PHATBOT"}</p><span className="text-xl text-[#ff0032]">→</span></div></Link>;
}
