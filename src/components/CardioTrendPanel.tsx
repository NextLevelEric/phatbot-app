"use client";

import {
  describeEffortChange,
  describeEffortContext,
  formatEffortTime,
  type ComparableEffortGroup,
} from "@/features/cardio/comparableEfforts";

function effortDate(value: string, long = false) {
  return new Date(value).toLocaleDateString(undefined, long
    ? { month: "short", day: "numeric", year: "numeric" }
    : { month: "numeric", day: "numeric" });
}

function TrendChart({ group }: { group: ComparableEffortGroup }) {
  if (group.efforts.length < 2) return null;
  const width = 640, height = 190, padX = 32, padY = 28;
  const times = group.efforts.map((effort) => Number(effort.segment.duration_seconds));
  const min = Math.min(...times), max = Math.max(...times), range = Math.max(1, max - min);
  const points = group.efforts.map((effort, index) => ({
    effort,
    x: padX + (index / (group.efforts.length - 1)) * (width - padX * 2),
    y: padY + ((Number(effort.segment.duration_seconds) - min) / range) * (height - padY * 2),
  }));
  return <div className="mt-5">
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black/20 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${group.displayLabel} completion-time trend`} className="h-auto w-full">
        <path d={points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ")} fill="none" stroke="#ff0032" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map(({ effort, x, y }) => <g key={effort.segment.id}><circle cx={x} cy={y} r="8" fill="#ff0032" stroke="#09090b" strokeWidth="4" /><title>{`${effortDate(effort.activity.started_at, true)}: ${formatEffortTime(effort.segment.duration_seconds)}`}</title></g>)}
      </svg>
    </div>
    <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-[.12em] text-zinc-600">Lower time is better · higher on chart is faster</p>
  </div>;
}

export default function CardioTrendPanel({ group }: { group: ComparableEffortGroup }) {
  const change = group.previous ? describeEffortChange(group.latest.segment.duration_seconds, group.previous.segment.duration_seconds) : null;
  return <div className="mt-4 grid gap-4">
    <section className="rounded-3xl border border-[#ff0032]/30 bg-[#ff0032]/5 p-5">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">Latest {group.displayLabel}</p><p className="mt-2 text-4xl font-black sm:text-5xl">{formatEffortTime(group.latest.segment.duration_seconds)}</p><p className="mt-2 text-xs text-zinc-500">{effortDate(group.latest.activity.started_at, true)}</p></div><div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-zinc-500">Best</p><p className="mt-1 text-xl font-black text-[#ff0032]">{formatEffortTime(group.best.segment.duration_seconds)}</p></div></div>
      {group.previous ? <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl border border-zinc-800 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Previous</p><p className="mt-1 text-lg font-black">{formatEffortTime(group.previous.segment.duration_seconds)}</p></div><div className="rounded-xl border border-zinc-800 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Change</p><p className="mt-1 text-sm font-black text-[#ff0032]">{change}</p></div></div> : <p className="mt-5 rounded-xl border border-zinc-800 p-3 text-sm leading-6 text-zinc-400">One effort recorded. Complete another comparable {group.displayLabel.toLowerCase()} to start your trend.</p>}
    </section>
    <section className="rounded-3xl border border-zinc-800 p-5"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-zinc-500">Trend</p><h3 className="mt-1 text-xl font-black">Comparable efforts</h3></div><p className="text-xs text-zinc-500">{group.efforts.length} recorded</p></div><TrendChart group={group} /></section>
    <section className="rounded-3xl border border-zinc-800 p-5"><p className="text-xs font-black uppercase tracking-wider text-zinc-500">Effort history</p><div className="mt-3 divide-y divide-zinc-900">{[...group.efforts].reverse().map((effort, index) => <div key={effort.segment.id} className="flex items-center justify-between gap-4 py-4"><div><p className="font-black">{effortDate(effort.activity.started_at, true)}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{describeEffortContext(effort, group.activityLabel)}{effort.activity.average_heart_rate_bpm == null ? "" : ` · ${Math.round(effort.activity.average_heart_rate_bpm)} bpm avg HR`}</p></div><div className="shrink-0 text-right"><p className="text-xl font-black">{formatEffortTime(effort.segment.duration_seconds)}</p>{index === 0 && <p className="text-[10px] font-bold text-[#ff0032]">LATEST</p>}</div></div>)}</div></section>
  </div>;
}
