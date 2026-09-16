"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CompetitionAwardArtwork from "@/components/CompetitionAwardArtwork";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { latestFinalizableWeeklyReportPeriod } from "@/features/weeklyReport/periods";
import { formatDistance, formatWeight, poAvailabilityCopy, signedValue, type WeeklyProgressReport } from "@/features/weeklyReport/report";

const EASTERN_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
const awardNames = { beast: "Beast", eager_beaver: "Eager Beaver", cardio_bunny: "Cardio Bunny", step_king: "Step King" } as const;

function weekLabel(report: WeeklyProgressReport) {
  const end = new Date(new Date(report.period_end).getTime() - 1);
  return `${EASTERN_DATE.format(new Date(report.period_start))} – ${EASTERN_DATE.format(end)}`;
}

function scoreStateClass(status: string) {
  if (status === "incomplete") return "border-amber-500/35 bg-amber-500/5";
  if (status === "available") return "border-[#ff0032]/40 bg-[#ff0032]/5";
  return "border-zinc-800 bg-zinc-950";
}

export default function WeeklyReportPage() {
  const [reports, setReports] = useState<WeeklyProgressReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();
    async function load() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { window.location.replace("/auth"); return; }
      let result = await supabase.from("weekly_progress_reports")
        .select("id,athlete_user_id,period_start,period_end,finalized_at,calculation_version,report_payload")
        .eq("athlete_user_id", user.id).order("period_start", { ascending: false }).limit(16);
      if (!result.error) {
        const latestDue = latestFinalizableWeeklyReportPeriod(new Date());
        const exists = (result.data ?? []).some(row => row.period_start === latestDue.startsAt.toISOString());
        const launchStart = new Date("2026-09-13T04:00:00.000Z");
        if (!exists && latestDue.startsAt >= launchStart && new Date() >= latestDue.readyAt) {
          const fallback = await supabase.rpc("finalize_my_weekly_progress_report", { p_period_start: latestDue.startsAt.toISOString() });
          if (!fallback.error) result = await supabase.from("weekly_progress_reports").select("id,athlete_user_id,period_start,period_end,finalized_at,calculation_version,report_payload").eq("athlete_user_id", user.id).order("period_start", { ascending: false }).limit(16);
        }
      }
      if (!mounted) return;
      if (result.error) setMessage("Your weekly report is temporarily unavailable. Your training data has not been changed.");
      else {
        const rows = (result.data ?? []) as unknown as WeeklyProgressReport[];
        setReports(rows);
        setSelectedId(rows[0]?.id ?? null);
      }
      setLoading(false);
    }
    void load();
    return () => { mounted = false; };
  }, []);

  const report = useMemo(() => reports.find(item => item.id === selectedId) ?? reports[0] ?? null, [reports, selectedId]);
  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-5 py-12"><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Weekly</p><h1 className="mt-2 text-3xl font-black">Finalizing the week...</h1><p className="mt-3 text-sm text-zinc-500">Reading your immutable Sunday report.</p></main>;
  if (message) return <main className="mx-auto min-h-screen max-w-2xl px-5 py-12"><Link href="/progress" className="text-sm font-black text-zinc-400">← Progress</Link><section className="mt-8 rounded-3xl border border-zinc-800 p-6"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Weekly Report</p><h1 className="mt-2 text-2xl font-black">Report unavailable</h1><p className="mt-3 text-sm leading-6 text-zinc-400">{message}</p><button onClick={() => location.reload()} className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-black text-black">Try again</button></section></main>;
  if (!report) return <main className="mx-auto min-h-screen max-w-2xl px-5 py-12"><Link href="/progress" className="text-sm font-black text-zinc-400">← Progress</Link><section className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-6"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Weekly Report</p><h1 className="mt-2 text-3xl font-black">Your first report is on the way.</h1><p className="mt-3 text-sm leading-6 text-zinc-400">PHATBOT finalizes Sunday-to-Sunday training after competition hardware settles Sunday. Keep training normally—nothing needs to be submitted.</p></section></main>;

  const payload = report.report_payload;
  const poCopy = poAvailabilityCopy(payload.progressive_overload.status);
  const volume = payload.training_volume;
  const maxVolume = Math.max(volume.value, volume.previous_value, 1);

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-10">
    <header><Link href="/progress" className="text-sm font-black text-zinc-500">← Progress</Link><p className="mt-6 text-xs font-black uppercase tracking-[.24em] text-[#ff0032]">PHATBOT Weekly</p><h1 className="mt-2 text-4xl font-black">{payload.summary.headline}</h1><p className="mt-2 text-sm text-zinc-500">{weekLabel(report)} · Eastern</p><p className="mt-4 max-w-xl text-base leading-7 text-zinc-300">{payload.summary.detail}</p></header>

    <section className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><p className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">Workouts</p><p className="mt-2 text-4xl font-black">{payload.workouts.completed}</p><p className="mt-1 text-xs text-zinc-600">across {payload.workouts.training_days} training day{payload.workouts.training_days === 1 ? "" : "s"}</p></div><div className={`rounded-2xl border p-5 ${scoreStateClass(payload.progressive_overload.status)}`}><p className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">PO Score</p><p className="mt-2 text-4xl font-black">{payload.progressive_overload.average_score_percent == null ? "—" : `${payload.progressive_overload.average_score_percent}%`}</p><p className="mt-1 text-xs text-zinc-600">persisted scoring only</p></div></section>

    {poCopy ? <section className={`rounded-2xl border p-5 ${scoreStateClass(payload.progressive_overload.status)}`}><p className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Progress scoring</p><p className="mt-2 text-sm leading-6 text-zinc-300">{poCopy}</p>{payload.progressive_overload.status === "incomplete" && <p className="mt-2 text-xs text-zinc-600">{payload.progressive_overload.persisted_exercise_scores} of {payload.progressive_overload.required_exercise_scores} exercise scores available.</p>}</section> : <section className="rounded-2xl border border-zinc-800 p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff0032]">Progressive Overload</p><div className="mt-4 grid grid-cols-3 gap-3 text-center"><div><p className="text-2xl font-black">{payload.progressive_overload.wins}</p><p className="text-[10px] uppercase text-zinc-600">Wins</p></div><div><p className="text-2xl font-black">{payload.progressive_overload.neutral}</p><p className="text-[10px] uppercase text-zinc-600">Held</p></div><div><p className="text-2xl font-black">{payload.progressive_overload.regressions}</p><p className="text-[10px] uppercase text-zinc-600">Regressions</p></div></div></section>}

    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Training Volume</p><p className="mt-2 text-3xl font-black">{Math.round(volume.value).toLocaleString()} <span className="text-sm text-zinc-600">{volume.unit}</span></p></div><p className="text-right text-sm font-black">{volume.change_percent == null ? "No prior comparison" : `${signedValue(volume.change_percent)}% volume change`}</p></div><div className="mt-5 space-y-3"><VolumeBar label="This week" value={volume.value} max={maxVolume} accent /><VolumeBar label="Prior week" value={volume.previous_value} max={maxVolume} /></div><p className="mt-4 text-xs leading-5 text-zinc-600">Eligible non-warmup, non-timed resistance workload: weight × completed reps.</p></section>

    {payload.exercise_wins.length > 0 && <section><p className="mb-3 text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Exercise Wins</p><div className="space-y-3">{payload.exercise_wins.map(win => <div key={win.canonical_exercise_id} className="rounded-2xl border border-zinc-800 p-5"><h2 className="font-black">{win.name}</h2>{win.current && win.previous ? <p className="mt-2 text-lg font-black"><span className="text-zinc-500">{win.previous.weight} × {win.previous.reps}</span> <span className="mx-2 text-[#ff0032]">→</span> {win.current.weight} × {win.current.reps}</p> : <p className="mt-2 text-sm text-zinc-400">Verified progressive-overload win</p>}</div>)}</div></section>}

    <section className="rounded-3xl border border-zinc-800 p-5 sm:p-6"><p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Cardio & Activity</p><div className="mt-4 grid grid-cols-2 gap-3"><div><p className="text-3xl font-black">{payload.cardio.sessions}</p><p className="text-xs text-zinc-600">cardio sessions</p></div><div><p className="text-3xl font-black">{formatDistance(payload.cardio.distance_meters)}</p><p className="text-xs text-zinc-600">total distance</p></div></div>{payload.cardio.comparable_improvements.map((item, index) => <p key={`${item.label}-${index}`} className="mt-4 rounded-xl bg-zinc-950 p-3 text-sm"><strong>{item.label}</strong> · {Math.round(item.improvement_seconds)} seconds faster than the prior comparable effort.</p>)}<p className="mt-4 text-sm text-zinc-500">{payload.steps.status === "available" ? `${Number(payload.steps.total).toLocaleString()} steps across 7 recorded days.` : `Steps unavailable for a complete weekly total (${payload.steps.recorded_days} of 7 days recorded).`}</p></section>

    {payload.bodyweight && <section className="rounded-2xl border border-zinc-800 p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Bodyweight Context</p><p className="mt-2 text-2xl font-black">Latest: {formatWeight(payload.bodyweight.latest, payload.bodyweight.unit)}</p><p className="mt-1 text-sm text-zinc-500">Change: {signedValue(payload.bodyweight.change)} {payload.bodyweight.unit}</p><p className="mt-3 text-xs text-zinc-700">Descriptive only. PHATBOT does not judge weight change.</p></section>}

    {payload.hardware.length > 0 && <section><p className="mb-1 text-xs font-black uppercase tracking-[.2em] text-yellow-400">This Week&apos;s Finalized Hardware</p><p className="mb-4 text-xs leading-5 text-zinc-600">Awards use their authoritative competition windows, which differ from this training report.</p><div className="grid grid-cols-2 gap-3">{payload.hardware.map(award => <div key={award.award_id} className="rounded-2xl border border-yellow-500/25 bg-yellow-500/5 p-4 text-center"><CompetitionAwardArtwork competition={award.competition} className="mx-auto h-24 w-full" /><p className="mt-2 text-sm font-black">{awardNames[award.competition]}</p><p className="mt-1 text-[10px] uppercase tracking-[.14em] text-yellow-500">{award.cadence} champion</p></div>)}</div></section>}

    {payload.next_targets.length > 0 && <section className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-black p-5"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Next Week Baselines</p><div className="mt-4 space-y-3">{payload.next_targets.map((target, index) => <p key={`${target.label}-${index}`} className="text-sm"><strong>{target.label}</strong><br /><span className="text-zinc-500">{target.target}</span></p>)}</div></section>}

    {reports.length > 1 && <section><label htmlFor="weekly-report-history" className="text-xs font-black uppercase tracking-[.18em] text-zinc-600">Report History</label><select id="weekly-report-history" value={selectedId ?? ""} onChange={event => setSelectedId(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-800 bg-black p-3 text-sm font-bold">{reports.map(item => <option key={item.id} value={item.id}>{weekLabel(item)}</option>)}</select></section>}
    <p className="pb-8 text-center text-[10px] uppercase tracking-[.18em] text-zinc-800">Finalized {EASTERN_DATE.format(new Date(report.finalized_at))} · {report.calculation_version}</p>
  </main>;
}

function VolumeBar({ label, value, max, accent = false }: { label: string; value: number; max: number; accent?: boolean }) {
  return <div><div className="mb-1 flex justify-between text-[10px] uppercase text-zinc-600"><span>{label}</span><span>{Math.round(value).toLocaleString()}</span></div><div className="h-3 rounded-full bg-zinc-900"><div className={`h-3 rounded-full ${accent ? "bg-[#ff0032]" : "bg-zinc-600"}`} style={{ width: `${Math.max(2, value / max * 100)}%` }} /></div></div>;
}
