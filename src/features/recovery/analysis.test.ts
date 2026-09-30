import { describe,expect,it } from 'vitest';
import { aggregateSleep } from './sleep';
import { analyzeAssociation,pairSleepAndTraining,sleepPerformanceGroups,sleepBaseline,spearman,type Training } from './analysis';
const night=aggregateSleep([{value:1,startDate:'2026-09-20T23:00:00Z',endDate:'2026-09-21T11:00:00Z',durationSeconds:0}],'healthkit','America/New_York','2026-09-01','2026-10-01')[0];
const workout=(id:string,startedAt:string):Training=>({id,startedAt,endedAt:startedAt,label:'Run',href:'/progress/activity/'+id,details:[],signals:[{key:'37:run-5k:long',label:'5K Run',value:2000,unit:'seconds',lowerIsBetter:true}]});
describe('sleep and training association',()=>{
  it('requires training after wake, before next sleep, on the local wake date',()=>{
    const next=aggregateSleep([{value:1,startDate:'2026-09-22T02:00:00Z',endDate:'2026-09-22T10:00:00Z',durationSeconds:0}],'healthkit','America/New_York','2026-09-01','2026-10-01')[0];
    const rows=[workout('before','2026-09-21T10:59:00Z'),workout('after','2026-09-21T11:00:00Z'),workout('late','2026-09-22T01:00:00Z'),workout('asleep','2026-09-22T03:00:00Z'),workout('next-day','2026-09-22T05:00:00Z')];
    expect(pairSleepAndTraining([night,next],rows)[0].training.map(row=>row.id)).toEqual(['after','late']);
  });
  it('includes prior long-run context only before sleep and never claims a missed workout',()=>{
    const observation=pairSleepAndTraining([night],[workout('long-run','2026-09-20T12:00:00Z'),workout('during','2026-09-21T03:00:00Z')])[0];
    expect(observation.preceding.map(row=>row.id)).toEqual(['long-run']);expect(observation.training).toEqual([]);
  });
  it('does not pair unknown wake times or use uncertain nights for analysis',()=>{
    expect(pairSleepAndTraining([{...night,wake_time:null}], [workout('x','2026-09-21T12:00:00Z')])[0].training).toEqual([]);
    expect(sleepPerformanceGroups(pairSleepAndTraining([{...night,quality_flags:['conflicting_states']}],[workout('x','2026-09-21T12:00:00Z')]))).toEqual([]);
  });
  it('counts a date once and keeps different training signals separate',()=>{
    const rows=[workout('a','2026-09-21T12:00:00Z'),workout('b','2026-09-21T15:00:00Z')];
    const groups=sleepPerformanceGroups(pairSleepAndTraining([night],rows));expect(groups[0].count).toBe(1);
    rows[1].signals[0].key='52:walk-5k:long';expect(sleepPerformanceGroups(pairSleepAndTraining([night],rows))).toHaveLength(2);
  });
  it('requires coverage and variation; constants and small samples cannot yield a claim',()=>{
    const points=Array.from({length:18},(_,i)=>({day:`2026-09-${String(i+1).padStart(2,'0')}`,sleepHours:7,value:i}));
    expect(analyzeAssociation(points.slice(0,10)).reason).toContain('18');expect(analyzeAssociation(points).reason).toContain('too similar');expect(spearman(points)).toBeNull();
  });
  it('uses personal thirds and descriptive means with temporal stability, not universal thresholds',()=>{
    const points=Array.from({length:24},(_,i)=>({day:`2026-09-${String(i+1).padStart(2,'0')}`,sleepHours:5+(i%8)*.5,value:2200-(i%8)*30}));
    const result=analyzeAssociation(points);expect(result.reason).toBeNull();expect(result.lower).toHaveLength(8);expect(result.upper).toHaveLength(8);
    const reversed=points.map((point,i)=>({...point,value:i<12?point.value:4400-point.value}));expect(analyzeAssociation(reversed).reason).toContain('No consistent');
  });
  it('does not use missing days as zero or include future sleep in the baseline',()=>{
    const result=sleepBaseline([night,{...night,wake_date:'2026-10-01'}],Date.parse('2026-09-22T12:00:00Z'),'America/New_York');
    expect(result.weekCount).toBe(1);expect(result.weekAverage).toBe(43200);expect(result.baselineAverage).toBeNull();
  });
});
