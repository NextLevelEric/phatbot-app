import Link from 'next/link';
import { activityLabel, activityMilestones, averageMotion, distanceText, positive, reportSegments, sourceLabel, wholeActivitySummary } from '@/features/cardio/activityReport';
import type { ActivityReportData } from '@/features/cardio/activityReportData';
import { describeEffortContext, formatEffortTime } from '@/features/cardio/comparableEfforts';

export function ActivityMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-zinc-800 p-4"><dt className="text-xs font-bold text-zinc-400">{label}</dt><dd className="mt-2 text-2xl font-black tabular-nums">{value}</dd></div>;
}

export default function CardioActivityReport({ data }: { data: ActivityReportData }) {
  const { activity, history, segments, comparisonsAvailable } = data;
  const motion = averageMotion(activity);
  const milestones = history ? activityMilestones(activity, history) : [];
  const comparisons = reportSegments(activity, segments ?? [], data.previousSegments, data.previousActivities);
  const improved = comparisons.filter(item => item.previous && item.segment.duration_seconds < item.previous.segment.duration_seconds);
  const bestImprovement = improved.sort((a,b) => ((a.previous!.segment.duration_seconds-a.segment.duration_seconds)/a.previous!.segment.duration_seconds)-((b.previous!.segment.duration_seconds-b.segment.duration_seconds)/b.previous!.segment.duration_seconds)).at(-1) ?? null;
  const headline = bestImprovement
    ? `Progress detected: your ${bestImprovement.segment.segment_label} effort was faster than your previous comparable effort.`
    : milestones.length
      ? milestones[0]
      : comparisons.some(item => item.previous)
        ? "Workout recorded. Your comparable efforts are shown below."
        : "Baseline recorded. Complete another comparable effort to measure progression.";
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
    <Link href="/progress/activity" className="min-h-11 py-2 text-sm font-bold text-zinc-400">← Activity &amp; Cardio</Link>
    <header><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Completed activity</p><h1 className="mt-2 text-3xl font-black">{activityLabel(activity)} report</h1><p className="mt-2 text-sm text-zinc-400">{new Date(activity.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} · {sourceLabel(activity.source)}</p></header>
    <dl className="grid grid-cols-2 gap-3">
      {positive(activity.distance_meters) && <ActivityMetric label="Total distance" value={distanceText(activity.distance_meters)} />}
      {positive(activity.duration_seconds) && <ActivityMetric label="Recorded duration" value={formatEffortTime(activity.duration_seconds)} />}
      {motion && <ActivityMetric label={motion.label} value={motion.value} />}
      {positive(activity.average_heart_rate_bpm) && <ActivityMetric label="Average heart rate" value={`${Math.round(activity.average_heart_rate_bpm)} bpm`} />}
      {positive(activity.active_energy_kcal) && <ActivityMetric label="Active energy" value={`${Math.round(activity.active_energy_kcal).toLocaleString()} kcal`} />}
    </dl>
    <section className="rounded-3xl border border-[#ff0032]/30 bg-[#ff0032]/5 p-5">
      <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#ff0032]">PHATBOT result</p>
      <h2 className="mt-2 text-2xl font-black">{headline}</h2>
      <h3 className="mt-5 text-lg font-black">Workout summary</h3>
      <p className="mt-3 leading-7 text-zinc-200">{wholeActivitySummary(activity)}</p>
      {milestones.map(item => <p key={item} className="mt-3 font-semibold">{item}</p>)}
      {history === null ? <p className="mt-3 text-sm text-amber-300">Historical comparisons could not load. No milestone claims are shown.</p> : <p className="mt-3 text-xs leading-5 text-zinc-400">Milestones use stored activities of the same type during the 30 days before this workout. Missing or unsynced history is not included; later workouts do not change this comparison.</p>}
    </section>
    <section className="rounded-3xl border border-zinc-800 p-5">
      <h2 className="text-xl font-black">Standardized segments</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">These are comparable efforts within your workout, not a score for the entire activity. A segment inside a long workout has different context from a standalone effort.</p>
      {segments === null ? <p role="status" className="mt-4 text-sm text-amber-300">Segments could not load. Your whole-workout measurements are shown above.</p> : comparisons.length === 0 ? <p className="mt-4 text-sm text-zinc-400">No standardized segments were stored for this activity. Its full distance and duration still stand on their own.</p> : <div className="mt-5 grid gap-4">{comparisons.map(({ segment, previous, context, change }) => <article key={segment.id} className="rounded-2xl border border-zinc-800 p-4">
        <div className="flex items-start justify-between gap-3"><h3 className="font-black">{segment.segment_label} {activityLabel(activity)}</h3><p className="text-xl font-black tabular-nums">{formatEffortTime(segment.duration_seconds)}</p></div>
        <p className="mt-2 text-xs leading-5 text-zinc-400">{context} · {formatEffortTime(segment.start_offset_seconds)}–{formatEffortTime(segment.end_offset_seconds)} into workout</p>
        <p className="mt-3 text-sm font-semibold">{comparisonsAvailable ? change : 'Previous-effort comparison is temporarily unavailable.'}</p>
        {comparisonsAvailable && previous && <div className="mt-2 text-xs leading-5 text-zinc-400"><p>Previous: {formatEffortTime(previous.segment.duration_seconds)} · {new Date(previous.activity.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p><p>{describeEffortContext(previous, activityLabel(previous.activity))}</p><Link href={`/progress/activity/${previous.activity.id}`} className="inline-block min-h-11 py-3 font-semibold text-zinc-200 underline">Open previous activity</Link></div>}
        <Link href={`/progress/activity/benchmark/${activity.activity_type}/${encodeURIComponent(segment.segment_key)}`} className="inline-block min-h-11 py-3 text-sm font-bold text-zinc-200 underline">View {segment.segment_label} progression →</Link>
      </article>)}</div>}
    </section>
    <p className="text-xs leading-5 text-zinc-500">Measurements come from {sourceLabel(activity.source)}. Pace or speed uses total distance and recorded duration; it may differ from moving pace shown by your device.</p>
  </main>;
}
