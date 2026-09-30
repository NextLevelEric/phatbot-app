import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadActivityReport, loadActivityWindow } from './activityReportData';
import { longRun, previousRun, fiveK, previousFiveK } from './activityReport.fixture';

type Call = { table:string; filters: Array<[string,unknown]>; orders: string[]; select:string; range?:number[]; limit?:number; single?:boolean };
function client(respond:(call:Call)=>unknown) {
  const calls:Call[]=[];
  return { calls, db: {from:(table:string)=>{
    const call:Call={table,filters:[],orders:[],select:''};calls.push(call);
    const query={
      select:(value:string)=>{call.select=value;return query;},
      eq:(key:string,value:unknown)=>{call.filters.push([key,value]);return query;},
      gte:(key:string,value:unknown)=>{call.filters.push([`gte:${key}`,value]);return query;},
      lte:(key:string,value:unknown)=>{call.filters.push([`lte:${key}`,value]);return query;},
      lt:(key:string,value:unknown)=>{call.filters.push([`lt:${key}`,value]);return query;},
      gt:(key:string,value:unknown)=>{call.filters.push([`gt:${key}`,value]);return query;},
      order:(key:string)=>{call.orders.push(key);return query;},
      range:(...values:number[])=>{call.range=values;return query;},
      limit:(value:number)=>{call.limit=value;return query;},
      maybeSingle:()=>{call.single=true;return query;},
      then:(resolve:(value:unknown)=>unknown,reject:(error:unknown)=>unknown)=>Promise.resolve().then(()=>respond(call)).then(resolve,reject),
    };return query;
  }} as unknown as SupabaseClient };
}
describe('read-only activity report queries', () => {
  it('paginates complete windows with deterministic ordering and athlete ownership',async()=>{
    const mock=client(call=>({data:call.range?.[0]===0?Array.from({length:200},()=>longRun):[previousRun],error:null}));
    expect(await loadActivityWindow(mock.db,'owner','start','end')).toHaveLength(201);
    expect(mock.calls.map(call=>call.range)).toEqual([[0,199],[200,399]]);
    for(const call of mock.calls){expect(call.filters).toContainEqual(['athlete_user_id','owner']);expect(call.orders).toEqual(['started_at','id']);}
  });
  it('returns no report for an inaccessible or invalid ID before reading related history',async()=>{
    const mock=client(()=>({data:null,error:null}));
    expect(await loadActivityReport(mock.db,'owner','invalid')).toBeNull();expect(mock.calls).toHaveLength(0);
    expect(await loadActivityReport(mock.db,'owner',longRun.id)).toBeNull();expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].filters).toContainEqual(['athlete_user_id','owner']);
    expect(mock.calls[0].filters).toContainEqual(['id',longRun.id]);
  });
  it('fetches exact previous matching segments before the workout, without a recent-history cap',async()=>{
    const mock=client(call=>({data:call.single?longRun:call.table==='cardio_activities'?[previousRun]:call.limit?[{...previousFiveK,cardio_activities:previousRun}]:[fiveK],error:null}));
    const result=await loadActivityReport(mock.db,'owner',longRun.id);
    expect(result?.previousActivities).toEqual([previousRun]);
    const comparison=mock.calls.find(call=>call.limit===1)!;
    expect(comparison.filters).toEqual(expect.arrayContaining([['athlete_user_id','owner'],['cardio_activities.athlete_user_id','owner'],['cardio_activities.activity_type',37],['segment_key','run-5k'],['distance_meters',5000],['lt:cardio_activities.started_at',longRun.started_at]]));
    expect(comparison.orders).toContain('cardio_activities(started_at)');
    expect(comparison.filters).toContainEqual(['gt:duration_seconds',0]);
    expect(comparison.filters.some(([name])=>name.startsWith('gte:'))).toBe(false);
  });
  it('keeps whole-workout data when auxiliary history or comparison reads fail',async()=>{
    const mock=client(call=>call.single?{data:longRun,error:null}:call.table==='cardio_activities'||call.limit?{data:null,error:{message:'private'}}:{data:[fiveK],error:null});
    const result=await loadActivityReport(mock.db,'owner',longRun.id);
    expect(result?.activity).toEqual(longRun);expect(result?.history).toBeNull();expect(result?.comparisonsAvailable).toBe(false);
  });
  it('rejects a partial paginated history rather than inventing a milestone from it',async()=>{
    const mock=client(call=>call.range?.[0]===0?{data:Array(200).fill(longRun),error:null}:{data:null,error:{message:'failure'}});
    await expect(loadActivityWindow(mock.db,'owner','start','end')).rejects.toThrow('ACTIVITY_HISTORY_UNAVAILABLE');
  });
});
