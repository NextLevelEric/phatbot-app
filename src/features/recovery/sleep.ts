export type SleepSample = { value: number; startDate: string; endDate: string; durationSeconds: number };
export type SleepNight = {
  source: string; wake_date: string; time_zone: string; sleep_start: string | null; wake_time: string | null;
  interval_start: string; interval_end: string; asleep_seconds: number | null; in_bed_seconds: number | null;
  awake_seconds: number | null; stages: Record<string, number>; quality_flags: string[];
  raw_samples: SleepSample[]; additional_sleep_seconds: number; method_version: number;
};
const HOUR = 3600000;
export function localDate(value: string | number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(value));
  return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
}
export function sleepHours(seconds: number | null) { return seconds === null ? 'Unknown' : `${(seconds / 3600).toFixed(1)} h`; }
export function shiftDay(day:string,offset:number) { const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10); }
type Interval = { start: number; end: number; sample: SleepSample };

// HealthKit 0=in bed, 1=unspecified asleep, 2=awake, 3=core, 4=deep, 5=REM.
// Android's existing bridge emits whole session spans with value=1, NOT asleep.
export function aggregateSleep(samples: SleepSample[], source: string, timeZone: string, windowStart: string, windowEnd: string): SleepNight[] {
  localDate(windowEnd, timeZone); // Validate the IANA zone; never silently guess UTC.
  let invalid = false;
  const intervals = [...new Map(samples.map(sample=>[`${sample.startDate}|${sample.endDate}|${sample.value}`,sample])).values()].flatMap(sample=>{
    const start=Date.parse(sample.startDate),end=Date.parse(sample.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end<=start || end-start>24*HOUR) { invalid=true; return []; }
    return [{start,end,sample}];
  }).sort((a,b)=>a.start-b.start || a.end-b.end);
  const clusters: Interval[][]=[];
  let lastEnd=-Infinity;
  for (const interval of intervals) {
    if (interval.start-lastEnd>3*HOUR) clusters.push([]);
    clusters.at(-1)!.push(interval); lastEnd=Math.max(lastEnd,interval.end);
  }
  const episodes = clusters.map(rows=>{
    const points=[...new Set(rows.flatMap(row=>[row.start,row.end]))].sort((a,b)=>a-b);
    let asleep=0,bed=0,awake=0,conflict=0,sleepStart:number|null=null,wake:number|null=null;
    const stages:Record<string,number>={};
    const sawSleep=source==='healthkit' && rows.some(row=>[1,3,4,5].includes(row.sample.value));
    const flags:string[]=[];
    for(let i=0;i<points.length-1;i++) {
      const a=points[i],b=points[i+1],seconds=(b-a)/1000;
      const values=new Set(rows.filter(row=>row.start<b && row.end>a).map(row=>row.sample.value));
      if(source!=='healthkit') continue;
      if(values.has(0)) bed+=seconds;
      if(values.has(2)) awake+=seconds;
      const detailed=[3,4,5].filter(value=>values.has(value));
      const isAsleep=values.has(1)||detailed.length>0;
      if(isAsleep && values.has(2)) { conflict+=seconds; continue; }
      if(!isAsleep) continue;
      asleep+=seconds; sleepStart??=a;wake=b;
      // Overlapping generic asleep is an umbrella, not an additional stage.
      // Conflicting specific stages remain unspecified; never choose one.
      const label=detailed.length===1?({3:'core',4:'deep',5:'rem'} as Record<number,string>)[detailed[0]]:'unspecified';
      if(detailed.length>1) conflict+=seconds;
      stages[label]=(stages[label]??0)+seconds;
    }
    const first=points[0],end=points.at(-1)!;
    if(invalid) flags.push('invalid_samples');
    if(source!=='healthkit') flags.push('session_only');
    if(conflict>0) flags.push('conflicting_states');
    if(rows.some(row=>![0,1,2,3,4,5].includes(row.sample.value))) flags.push('unknown_category');
    if(end-first>24*HOUR) flags.push('long_episode');
    if(first<=Date.parse(windowStart)||end>=Date.parse(windowEnd)) flags.push('window_boundary');
    return {
      source,wake_date:localDate(wake??end,timeZone),time_zone:timeZone,
      sleep_start:sleepStart===null?null:new Date(sleepStart).toISOString(),wake_time:wake===null?null:new Date(wake).toISOString(),
      interval_start:new Date(first).toISOString(),interval_end:new Date(end).toISOString(),
      asleep_seconds:sawSleep&&asleep>0?Math.round(asleep):null,
      in_bed_seconds:source==='healthkit'&&rows.some(row=>row.sample.value===0)?Math.round(bed):null,
      awake_seconds:source==='healthkit'&&rows.some(row=>row.sample.value===2)?Math.round(awake):null,
      stages,quality_flags:flags,raw_samples:rows.map(row=>row.sample),additional_sleep_seconds:0,method_version:1,
    } satisfies SleepNight;
  });
  // One main episode per wake date. Naps/fragmented episodes remain in raw data
  // and are disclosed separately, not silently added to the main night's sleep.
  const dates=[...new Set(episodes.map(row=>row.wake_date))];
  return dates.map(date=>{
    const sameDay=episodes.filter(row=>row.wake_date===date).sort((a,b)=>(b.asleep_seconds??-1)-(a.asleep_seconds??-1)||Date.parse(a.interval_start)-Date.parse(b.interval_start));
    const main=sameDay[0];
    return {...main,raw_samples:sameDay.flatMap(row=>row.raw_samples),additional_sleep_seconds:sameDay.slice(1).reduce((sum,row)=>sum+(row.asleep_seconds??0),0),quality_flags:[...new Set([...sameDay.flatMap(row=>row.quality_flags),...(sameDay.length>1?['multiple_episodes']:[])])]};
  }).sort((a,b)=>a.wake_date.localeCompare(b.wake_date));
}

export const reliableNight = (night: SleepNight) => night.asleep_seconds!==null && night.asleep_seconds>0 && night.quality_flags.length===0 && night.sleep_start!==null && night.wake_time!==null;
