"use client";

import Link from 'next/link';
import { useState } from 'react';
import { localDate, reliableNight, shiftDay, sleepHours, type SleepNight } from '@/features/recovery/sleep';
import { pairSleepAndTraining, sleepBaseline, sleepPerformanceGroups, type Training } from '@/features/recovery/analysis';
import { sourceLabel } from '@/features/cardio/activityReport';
import { formatEffortTime } from '@/features/cardio/comparableEfforts';

const flags:Record<string,string>={conflicting_states:'Conflicting sleep states',multiple_episodes:'Multiple sleep episodes',session_only:'Session span only; actual sleep unknown',window_boundary:'Incomplete sync window',invalid_samples:'Invalid intervals omitted',unknown_category:'Unrecognized category',long_episode:'Unusually long recording span'};
const time=(value:string,zone:string)=>new Date(value).toLocaleTimeString(undefined,{timeZone:zone,hour:'numeric',minute:'2-digit'});
export default function SleepRecoveryDashboard({ nights,training,warnings,asOf=Date.now() }:{nights:SleepNight[];training:Training[];warnings:string[];asOf?:number}) {
  const [source,setSource]=useState(nights.some(night=>night.source==='healthkit')?'healthkit':nights[0]?.source??'healthkit');
  const selected=nights.filter(night=>night.source===source).sort((a,b)=>b.wake_date.localeCompare(a.wake_date));
  const zone=selected[0]?.time_zone??Intl.DateTimeFormat().resolvedOptions().timeZone;
  const summary=sleepBaseline(selected,asOf,zone),observations=pairSleepAndTraining(selected,training),groups=sleepPerformanceGroups(observations);
  const [groupKey,setGroupKey]=useState('');
  const group=groups.find(item=>item.key===groupKey)??groups[0];
  const trend=Array.from({length:14},(_,index)=>{const date=shiftDay(localDate(asOf,zone),index-13);return {date,night:selected.find(night=>night.wake_date===date)};});
  const maxHours=Math.max(1,...trend.map(({night})=>night?.asleep_seconds?night.asleep_seconds/3600:0));
  const metric=(value:number)=>group?.signal.unit==='seconds'?formatEffortTime(value):`${value.toFixed(1)}%`;
  return <div className="flex flex-col gap-6">
    {warnings.map(warning=><p key={warning} role="status" className="rounded-xl border border-amber-500/30 p-4 text-sm text-amber-200">{warning}</p>)}
    {[...new Set(nights.map(night=>night.source))].length>1&&<label className="text-sm">Sleep source<select value={source} onChange={event=>setSource(event.target.value)} className="ml-3 rounded-lg border border-zinc-700 bg-black p-2">{[...new Set(nights.map(night=>night.source))].map(value=><option key={value} value={value}>{sourceLabel(value)}</option>)}</select></label>}
    <section className="rounded-3xl border border-zinc-800 p-5"><h2 className="text-xl font-black">Your recent sleep</h2><div className="mt-4 grid grid-cols-2 gap-3"><div><p className="text-xs text-zinc-400">Last 7 days · {summary.weekCount} known nights</p><p className="mt-2 text-3xl font-black">{sleepHours(summary.weekAverage)}</p></div><div><p className="text-xs text-zinc-400">Previous 21 days · {summary.baselineCount} known nights</p><p className="mt-2 text-3xl font-black">{sleepHours(summary.baselineAverage)}</p></div></div>
      {summary.weekCount>=3&&summary.weekAverage!==null&&summary.baselineAverage!==null&&<p className="mt-4 text-sm text-zinc-300">Your recent average is {Math.abs((summary.weekAverage-summary.baselineAverage)/3600).toFixed(1)} h {summary.weekAverage>=summary.baselineAverage?'above':'below'} your own preceding baseline.</p>}
      <p className="mt-3 text-xs leading-5 text-zinc-500">Averages include only known main sleep episodes without data-quality flags. Missing nights are not zero. Baseline needs 7 known nights; comparison needs 3 in the recent week.</p>
      <div className="mt-5 flex h-32 items-end gap-1" role="img" aria-label="14-day sleep duration trend; gaps indicate missing or uncertain data">{trend.map(({date,night})=><div key={date} className="flex min-w-0 flex-1 flex-col items-center gap-2" title={`${date}: ${night&&reliableNight(night)?sleepHours(night.asleep_seconds):'Missing or uncertain'}`}><div className="flex h-24 w-full items-end rounded bg-zinc-900">{night&&reliableNight(night)&&<div className="w-full rounded bg-[#ff0032]" style={{height:`${(night.asleep_seconds!/3600)/maxHours*100}%`}}/>}</div><span className="text-[9px] text-zinc-500">{date.slice(8)}</span></div>)}</div><p className="mt-2 text-xs text-zinc-500">0–{maxHours.toFixed(1)} hours · day of month · {zone}</p>
    </section>
    <section className="rounded-3xl border border-[#ff0032]/30 bg-[#ff0032]/5 p-5"><h2 className="text-xl font-black">Sleep vs. performance</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Your own observations, grouped by comparable training. This describes association, not causation or a readiness score.</p>
      {groups.length>0&&<label className="mt-4 block text-xs text-zinc-400">Training signal<select aria-label="Training signal" value={group?.key??''} onChange={event=>setGroupKey(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white">{groups.map(item=><option key={item.key} value={item.key}>{item.signal.label} · {item.count} days</option>)}</select></label>}
      {!group?<p className="mt-4 text-sm">Not enough matched sleep and training data yet. Sync sleep and complete comparable workouts to build a history.</p>:<>
        <p className="mt-4 text-sm font-bold">{group.count} matched training days · last 120 days</p>
        {group.reason!==null?<p className="mt-3 text-sm text-zinc-300">{group.reason}</p>:<p className="mt-3 text-sm leading-6 text-zinc-200">On {group.lower.length} days in your lower sleep third (up to {group.lowerSleepMax!.toFixed(1)} h), the mean recorded result was {metric(group.lowerMean!)}. On {group.upper.length} days in your upper sleep third (from {group.upperSleepMin!.toFixed(1)} h), it was {metric(group.upperMean!)}.</p>}
        {group.points.length>=2&&<div className="mt-4"><svg viewBox="0 0 320 160" className="w-full" role="img" aria-label={`${group.signal.label} versus hours asleep scatter plot`}>
          <path d="M35 10V130H310" fill="none" stroke="#52525b"/>
          {(()=>{const values=group.points.map(point=>point.value),lo=Math.min(...values),hi=Math.max(...values),xs=group.points.map(point=>point.sleepHours),xmin=Math.min(...xs),xmax=Math.max(...xs);return <><text x="2" y="15" fill="#a1a1aa" fontSize="9">{metric(hi)}</text><text x="2" y="130" fill="#a1a1aa" fontSize="9">{metric(lo)}</text>{group.points.map(point=><circle key={point.day} cx={40+(point.sleepHours-xmin)/Math.max(.1,xmax-xmin)*260} cy={120-(point.value-lo)/Math.max(.1,hi-lo)*100} r="4" fill="#ff496d"><title>{`${point.day}: ${point.sleepHours.toFixed(1)} h, ${metric(point.value)}`}</title></circle>)}<text x="40" y="150" fill="#a1a1aa" fontSize="10">{xmin.toFixed(1)} h asleep</text><text x="260" y="150" fill="#a1a1aa" fontSize="10">{xmax.toFixed(1)} h</text></>;})()}
        </svg></div>}
        <p className="mt-3 text-xs leading-5 text-zinc-400">One observation per wake date and training signal. Sleep groups come from your own distribution, not universal hour targets. Workload, workout changes, time trends, illness and other factors are not controlled. This is exploratory; no significance or causal claim is made.</p>
      </>}
    </section>
    <section><h2 className="text-xl font-black">Sleep → Training → Performance</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Training after waking on the same local date, before the next sleep episode. No recorded training does not mean a missed workout.</p>
      {!selected.length&&<p className="mt-4 rounded-2xl border border-zinc-800 p-5 text-sm text-zinc-400">No interval-verified sleep yet. Sync Health Data from Account to import recent sleep. Older daily totals are not used because their intervals cannot be verified.</p>}
      <div className="mt-4 grid gap-4">{observations.slice(0,14).map(({night,training:following,preceding})=><article key={`${night.source}:${night.wake_date}`} className="rounded-2xl border border-zinc-800 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">Wake date · {night.wake_date}</h3><p className="mt-1 text-xs text-zinc-500">{sourceLabel(night.source)} · {night.time_zone}</p></div><p className="text-2xl font-black">{sleepHours(night.asleep_seconds)}</p></div>
        {night.sleep_start&&night.wake_time&&<p className="mt-3 text-sm text-zinc-300">Sleep start {time(night.sleep_start,night.time_zone)} → Last asleep interval ends {time(night.wake_time,night.time_zone)}</p>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-400">{night.in_bed_seconds!==null&&<span>In bed {sleepHours(night.in_bed_seconds)}</span>}{night.awake_seconds!==null&&<span>Recorded awake {sleepHours(night.awake_seconds)}</span>}{Object.entries(night.stages).map(([stage,seconds])=><span key={stage}>{stage==='core'?'Core / Light':stage.toUpperCase()} {sleepHours(seconds)}</span>)}</div>
        {night.additional_sleep_seconds>0&&<p className="mt-3 text-xs text-zinc-400">Additional episodes: {sleepHours(night.additional_sleep_seconds)}; not added to the main episode.</p>}
        {night.quality_flags.length>0&&<p className="mt-3 text-xs text-amber-300">{night.quality_flags.map(flag=>flags[flag]??'Uncertain recording').join(' · ')}. Excluded from performance analysis.</p>}
        <div className="mt-4 border-t border-zinc-800 pt-4"><p className="text-xs font-bold uppercase text-zinc-500">Following training</p>{following.length?following.map(workout=><Link key={workout.id} href={workout.href} className="mt-2 block rounded-xl border border-zinc-800 p-3"><p className="text-sm font-bold">{workout.label} →</p><p className="mt-1 text-xs leading-5 text-zinc-400">{workout.details.join(' · ')}</p>{workout.signals.filter(signal=>signal.unit==='seconds').map(signal=><p key={signal.key} className="mt-1 text-xs text-zinc-400">{signal.label}: {formatEffortTime(signal.value)}</p>)}</Link>):<p className="mt-2 text-sm text-zinc-500">No following training records available.</p>}</div>
        {preceding.length>0&&<details className="mt-3"><summary className="cursor-pointer py-2 text-xs font-bold text-zinc-400">Training in the 24 hours before this sleep</summary>{preceding.map(workout=><Link key={workout.id} href={workout.href} className="block py-3 text-xs text-zinc-400">{workout.label} · {workout.details.join(' · ')} →</Link>)}</details>}
      </article>)}</div>
    </section>
    <p className="text-xs leading-5 text-zinc-500">Dates use the timezone captured on the device at sync. Historical travel may differ. Sleep stages are source observations, not a medical assessment.</p>
  </div>;
}
