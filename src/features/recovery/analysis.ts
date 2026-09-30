import { localDate, reliableNight, shiftDay, type SleepNight } from './sleep';

export type TrainingSignal = { key:string; label:string; value:number; unit:'%'|'seconds'; lowerIsBetter:boolean };
export type Training = { id:string; label:string; startedAt:string; endedAt:string; href:string; details:string[]; signals:TrainingSignal[] };
export type RecoveryObservation = { night:SleepNight; training:Training[]; preceding:Training[] };
const DAY=86400000;

export function pairSleepAndTraining(nights:SleepNight[], training:Training[]):RecoveryObservation[] {
  return nights.map(night=>{
    const wake=night.wake_time?Date.parse(night.wake_time):NaN;
    const nextSleep=nights.flatMap(row=>row.raw_samples.filter(sample=>[1,3,4,5].includes(sample.value)&&Date.parse(sample.startDate)>wake).map(sample=>Date.parse(sample.startDate))).sort((a,b)=>a-b)[0]??Infinity;
    return {night,
      training:training.filter(row=>Number.isFinite(wake) && Date.parse(row.startedAt)>=wake && Date.parse(row.startedAt)<nextSleep && localDate(row.startedAt,night.time_zone)===night.wake_date),
      preceding:training.filter(row=>Date.parse(row.endedAt)<=Date.parse(night.interval_start) && Date.parse(row.endedAt)>Date.parse(night.interval_start)-DAY),
    };
  });
}
export type AssociationPoint = { day:string; sleepHours:number; value:number };
const mean=(values:number[])=>values.reduce((sum,value)=>sum+value,0)/values.length;
function ranks(values:number[]) {
  const sorted=[...values].sort((a,b)=>a-b);
  return values.map(value=>{const first=sorted.indexOf(value),last=sorted.lastIndexOf(value);return (first+last)/2+1;});
}
export function spearman(points:AssociationPoint[]) {
  const x=ranks(points.map(point=>point.sleepHours)),y=ranks(points.map(point=>point.value));
  const mx=mean(x),my=mean(y);
  const numerator=x.reduce((sum,value,i)=>sum+(value-mx)*(y[i]-my),0);
  const divisor=Math.sqrt(x.reduce((sum,value)=>sum+(value-mx)**2,0)*y.reduce((sum,value)=>sum+(value-my)**2,0));
  return divisor>0?numerator/divisor:null;
}
export function analyzeAssociation(points:AssociationPoint[]) {
  const chronological=[...points].sort((a,b)=>a.day.localeCompare(b.day));
  const ordered=[...points].sort((a,b)=>a.sleepHours-b.sleepHours),tail=Math.floor(points.length/3);
  const lower=ordered.slice(0,tail),upper=ordered.slice(-tail);
  const base={count:points.length,points:chronological,lower,upper};
  if(points.length<18) return {...base,reason:'Need at least 18 matched training days for this comparison.'};
  if(upper[0].sleepHours-lower.at(-1)!.sleepHours<0.5) return {...base,reason:'Sleep durations are too similar to separate meaningful groups.'};
  const difference=mean(upper.map(row=>row.value))-mean(lower.map(row=>row.value));
  const midpoint=Math.floor(points.length/2),first=spearman(chronological.slice(0,midpoint)),second=spearman(chronological.slice(midpoint));
  // Stability guard, not a significance test. Never select the strongest result
  // across many metrics and present it as an established recovery relationship.
  if(first===null||second===null||first*second<=0||difference===0||Math.sign(first)!==Math.sign(difference)) return {...base,reason:'No consistent association across the earlier and later observations.'};
  return {...base,reason:null,lowerMean:mean(lower.map(row=>row.value)),upperMean:mean(upper.map(row=>row.value)),lowerSleepMax:lower.at(-1)!.sleepHours,upperSleepMin:upper[0].sleepHours,rho:spearman(points)};
}

export function sleepPerformanceGroups(observations:RecoveryObservation[]) {
  const groups=new Map<string,{signal:TrainingSignal;days:Map<string,{sleep:number;values:number[]}>}>();
  for(const {night,training} of observations) {
    if(!reliableNight(night)) continue;
    for(const workout of training) for(const signal of workout.signals) {
      if(!Number.isFinite(signal.value)) continue;
      // Separate providers/timezones and training identities. One day, one
      // observation per signal: repeated sessions cannot inflate sample size.
      const key=`${night.source}:${night.time_zone}:${signal.key}`;
      const group=groups.get(key)??{signal,days:new Map()};
      const day=group.days.get(night.wake_date)??{sleep:night.asleep_seconds!/3600,values:[]};
      day.values.push(signal.value);group.days.set(night.wake_date,day);groups.set(key,group);
    }
  }
  return [...groups].map(([key,group])=>({key,signal:group.signal,...analyzeAssociation([...group.days].map(([day,entry])=>({day,sleepHours:entry.sleep,value:mean(entry.values)})))})).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
}

export function sleepBaseline(nights:SleepNight[], asOf:number, timeZone:string) {
  const today=localDate(asOf,timeZone),start7=shiftDay(today,-6),start28=shiftDay(today,-27);
  const known=nights.filter(night=>reliableNight(night)&&night.wake_date<=today&&night.time_zone===timeZone);
  const week=known.filter(night=>night.wake_date>=start7),baseline=known.filter(night=>night.wake_date>=start28&&night.wake_date<start7);
  return {weekCount:week.length,baselineCount:baseline.length,weekAverage:week.length?mean(week.map(night=>night.asleep_seconds!)):null,baselineAverage:baseline.length>=7?mean(baseline.map(night=>night.asleep_seconds!)):null};
}
