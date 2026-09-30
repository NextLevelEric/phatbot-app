import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadRecoveryData } from './data';
import { longRun,fiveK } from '@/features/cardio/activityReport.fixture';
type Call={table:string;filters:Array<[string,unknown]>;offset:number};
function mock(respond:(call:Call)=>{data:unknown[]|null;error:unknown}) {
  const calls:Call[]=[];
  const db={from:(table:string)=>{
    const call:Call={table,filters:[],offset:0};calls.push(call);
    const query={select:()=>query,order:()=>query,eq:(k:string,v:unknown)=>{call.filters.push([k,v]);return query;},gte:(k:string,v:unknown)=>{call.filters.push(['gte:'+k,v]);return query;},lte:(k:string,v:unknown)=>{call.filters.push(['lte:'+k,v]);return query;},in:(k:string,v:unknown)=>{call.filters.push(['in:'+k,v]);return query;},range:(offset:number)=>{call.offset=offset;return query;},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(respond(call)).then(resolve)};return query;
  }} as unknown as SupabaseClient;
  return {db,calls};
}
describe('recovery read model',()=>{
  it('paginates with owner scope and absolute time bounds, including local tomorrow east of UTC',async()=>{
    const m=mock(c=>({data:c.table==='health_sleep_nights'&&c.offset===0?Array(200).fill({wake_date:'2026-10-01'}):[],error:null}));
    const result=await loadRecoveryData(m.db,'owner',new Date('2026-09-30T23:00:00Z'));
    expect(result.nights).toHaveLength(200);
    expect(m.calls.filter(c=>c.table==='health_sleep_nights').map(c=>c.offset)).toEqual([0,200]);
    for(const c of m.calls)expect(c.filters).toContainEqual(['athlete_user_id','owner']);
    expect(m.calls[0].filters).toContainEqual(['lte:interval_end','2026-09-30T23:00:00.000Z']);
    expect(m.calls[0].filters.some(([key])=>key.includes('wake_date'))).toBe(false);
  });
  it('rejects partial sleep history and preserves sleep when training is unavailable',async()=>{
    const partial=mock(c=>({data:c.offset===0?Array(200).fill({}):null,error:c.offset?{}:null}));
    await expect(loadRecoveryData(partial.db,'owner')).rejects.toThrow('RECOVERY_READ_FAILED');
    const m=mock(c=>({data:c.table==='health_sleep_nights'?[]:null,error:c.table==='health_sleep_nights'?null:{}}));
    expect((await loadRecoveryData(m.db,'owner')).warnings).toHaveLength(2);
  });
  it('keeps missing PO unknown and distinguishes long-activity segments',async()=>{
    const m=mock(c=>({data:c.table==='workout_sessions'?[{id:'strength',workout_id:'template',workout_name_snapshot:'Lift',started_at:'2026-09-27T10:00:00Z',completed_at:'2026-09-27T11:00:00Z',workout_scores:[]}]:c.table==='cardio_activities'?[{...longRun,ended_at:'2026-09-27T16:00:00Z'}]:c.table==='cardio_activity_segments'?[fiveK]:[],error:null}));
    const result=await loadRecoveryData(m.db,'owner');
    expect(result.training.find(t=>t.id==='strength')?.signals).toEqual([]);
    expect(result.training.find(t=>t.id===longRun.id)?.signals[0].key).toContain('inside longer activity');
  });
});
