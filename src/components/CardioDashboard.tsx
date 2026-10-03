"use client";

import Link from 'next/link';
import { useState } from 'react';
import { activityKind, activityLabel, activityMilestones, averageMotion, dashboardSummary, DAY_MS, distanceText, positive, walkingProgress, type Activity } from '@/features/cardio/activityReport';
import { formatEffortTime } from '@/features/cardio/comparableEfforts';
import { ActivityMetric } from './CardioActivityReport';

export function CardioSnapshot({ activities, asOf }: { activities: Activity[]; asOf: number }) {
  const summary = dashboardSummary(activities, asOf);
  return <>
    <section aria-labelledby="cardio-snapshot"><div className="mb-4 flex items-baseline justify-between gap-3"><h2 id="cardio-snapshot" className="text-xl font-black">Your cardio snapshot</h2><span className="text-xs text-zinc-400">Last 30 days</span></div>
      <dl className="grid grid-cols-2 gap-3">
        <ActivityMetric label="Cardio sessions" value={String(summary.count)} />
        <ActivityMetric label="Total cardio time" value={formatEffortTime(summary.seconds)} />
        <ActivityMetric label="Recorded distance · all types" value={summary.distanceCount ? distanceText(summary.meters) : '—'} />
        {summary.longest && <ActivityMetric label={`Longest duration · ${activityLabel(summary.longest)}`} value={formatEffortTime(summary.longest.duration_seconds)} />}
      </dl>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Based on synced cardio activities. Distance is available for {summary.distanceCount} of {summary.count} sessions. No pace average combines different activity types.</p>
      {summary.groups.length > 0 && <div className="mt-4 grid gap-3">{summary.groups.map(group => <div key={group.key} className="rounded-2xl border border-zinc-800 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-black">{group.label}</h3><p className="text-sm tabular-nums">{group.count} sessions · {formatEffortTime(group.seconds)}</p></div><p className="mt-2 text-sm text-zinc-400">{group.distanceCount ? `${distanceText(group.meters)} recorded distance · ` : ''}{group.previousCount ? `Previous 30 days: ${group.previousCount} sessions, ${formatEffortTime(group.previousSeconds)}` : 'No sessions recorded in the previous 30 days'}</p></div>)}</div>}
    </section>
  </>;
}


export function WalkingProgressCard({ activities, asOf }: { activities: Activity[]; asOf: number }) {
  const progress = walkingProgress(activities, asOf);
  if (!progress.latest) return null;
  const latestPace = progress.latestPaceSecondsPerMile != null ? `${formatEffortTime(progress.latestPaceSecondsPerMile)}/mi` : '—';
  const paceResult = progress.paceChangeSeconds == null
    ? 'Complete another walk with distance and duration to measure pace progression.'
    : Math.abs(progress.paceChangeSeconds) <= 1
      ? 'You essentially matched your previous walking pace.'
      : progress.paceChangeSeconds > 0
        ? `${formatEffortTime(Math.abs(progress.paceChangeSeconds))}/mi faster than your previous walk.`
        : `${formatEffortTime(Math.abs(progress.paceChangeSeconds))}/mi slower than your previous walk.`;
  return <section className="rounded-3xl border border-[#ff0032]/30 bg-[#ff0032]/5 p-5">
    <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#ff0032]">Walking progression</p>
    <div className="mt-2 flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">Your walks count.</h2><p className="mt-2 text-sm leading-6 text-zinc-300">{paceResult}</p></div><p className="shrink-0 text-2xl font-black tabular-nums">{latestPace}</p></div>
    <div className="mt-5 grid grid-cols-2 gap-3">
      <ActivityMetric label="Walks recorded" value={String(progress.walks.length)} />
      <ActivityMetric label="Latest distance" value={positive(progress.latest.distance_meters) ? distanceText(progress.latest.distance_meters) : '—'} />
      {progress.fastestPace && <ActivityMetric label="Best recorded pace" value={`${formatEffortTime(progress.fastestPace.duration_seconds / (Number(progress.fastestPace.distance_meters) / 1609.344))}/mi`} />}
      {progress.longestDistance && <ActivityMetric label="Longest recorded walk" value={distanceText(progress.longestDistance.distance_meters!)} />}
    </div>
    <p className="mt-3 text-xs leading-5 text-zinc-500">Walking stays separate from running. Pace progression compares whole recorded walks; standardized 1-mile, 5K and 10K walk efforts remain available below when your device provides distance samples.</p>
    <Link href={`/progress/activity/${progress.latest.id}`} className="mt-3 inline-block min-h-11 py-3 text-sm font-black underline">Open latest walk report →</Link>
  </section>;
}

export function RecentCardioActivities({ activities, asOf }: { activities: Activity[]; asOf: number }) {
  const [visible, setVisible] = useState(6);
  const recent = activities.filter(row => activityKind(row) && Date.parse(row.started_at) > asOf - 30 * DAY_MS && Date.parse(row.started_at) <= asOf);
  return <>
    <section aria-labelledby="recent-cardio"><h2 id="recent-cardio" className="text-xl font-black">Recent cardio activities</h2><p className="mt-1 text-sm text-zinc-400">The whole workout first. Open a report for its segments and comparisons.</p>
      {!recent.length ? <p className="mt-4 rounded-2xl border border-zinc-800 p-5 text-sm text-zinc-400">No cardio activities synced in the last 30 days.</p> : <div className="mt-4 grid gap-3">{recent.slice(0,visible).map(activity => {
        const motion = averageMotion(activity), milestone = activityMilestones(activity, activities)[0];
        return <Link key={activity.id} href={`/progress/activity/${activity.id}`} className="block rounded-2xl border border-zinc-800 p-5 transition hover:border-[#ff0032]/60 focus-visible:outline-2 focus-visible:outline-[#ff0032]">
          <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-black">{activityLabel(activity)}</h3><p className="text-xs text-zinc-400">{new Date(activity.started_at).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })}</p></div>
          <p className="mt-3 text-2xl font-black tabular-nums">{positive(activity.distance_meters) && <>{distanceText(activity.distance_meters)} <span className="text-zinc-600">· </span></>}{positive(activity.duration_seconds) ? formatEffortTime(activity.duration_seconds) : 'Duration unavailable'}</p>
          <p className="mt-2 text-sm text-zinc-400">{[motion?.value, positive(activity.average_heart_rate_bpm) ? `${Math.round(activity.average_heart_rate_bpm)} bpm avg HR` : null].filter(Boolean).join(' · ')}</p>
          {milestone && <p className="mt-3 text-xs font-bold text-[#ff496d]">{milestone}</p>}
          <p className="mt-4 text-sm font-bold">Open activity report →</p>
        </Link>;
      })}</div>}
      {recent.length > visible && <button type="button" onClick={()=>setVisible(value=>value+12)} className="mt-4 min-h-11 w-full rounded-xl border border-zinc-700 px-4 font-bold">Show more activities</button>}
    </section>
  </>;
}
