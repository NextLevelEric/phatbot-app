import type { SupabaseClient } from '@supabase/supabase-js';
import { activityKind, activityLabel, averageMotion, distanceText, positive, type Activity } from '@/features/cardio/activityReport';
import { ACTIVITY_FIELDS } from '@/features/cardio/activityReportData';
import { comparableEffortIdentity, formatEffortTime, type CardioSegmentRow } from '@/features/cardio/comparableEfforts';
import type { SleepNight } from './sleep';
import type { Training } from './analysis';

type QueryResult = { data: unknown[] | null; error: unknown };
async function pages(load:(offset:number)=>PromiseLike<QueryResult>) {
  const rows:unknown[]=[];
  for(let offset=0;;offset+=200) {
    const result=await load(offset);if(result.error) throw new Error('RECOVERY_READ_FAILED');
    rows.push(...result.data??[]);if((result.data?.length??0)<200)return rows;
  }
}
type StrengthRow = {id:string;workout_id:string|null;workout_name_snapshot:string;started_at:string;completed_at:string;workout_scores:Array<{score:number|null;scored_exercise_count:number;progression_count:number;regression_count:number;baseline_count:number}>};
export async function loadRecoveryData(client:SupabaseClient,userId:string,asOf=new Date()) {
  const start=new Date(asOf.getTime()-120*86400000).toISOString(),end=asOf.toISOString();
  // Timestamp bounds include completed nights east of UTC whose local wake
  // date is already tomorrow. Never use UTC calendar dates as local dates.
  const nights=await pages(offset=>client.from('health_sleep_nights').select('*').eq('athlete_user_id',userId).eq('method_version',1).gte('interval_end',start).lte('interval_end',end).order('wake_date',{ascending:false}).order('source').range(offset,offset+199)) as SleepNight[];
  const [strengthResult,cardioResult]=await Promise.allSettled([
    pages(offset=>client.from('workout_sessions').select('id,workout_id,workout_name_snapshot,started_at,completed_at,workout_scores(score,scored_exercise_count,progression_count,regression_count,baseline_count)').eq('athlete_user_id',userId).eq('status','completed').eq('is_test',false).gte('started_at',start).lte('completed_at',end).order('started_at').order('id').range(offset,offset+199)),
    pages(offset=>client.from('cardio_activities').select(`${ACTIVITY_FIELDS},ended_at`).eq('athlete_user_id',userId).gte('started_at',start).lte('ended_at',end).order('started_at').order('id').range(offset,offset+199)),
  ]);
  const warnings:string[]=[],training:Training[]=[];
  if(strengthResult.status==='fulfilled') for(const row of strengthResult.value as StrengthRow[]) {
    const score=row.workout_scores?.length===1?row.workout_scores[0]:null;
    const hasScore=score?.score!=null&&score.scored_exercise_count>0;
    training.push({id:row.id,label:row.workout_name_snapshot,startedAt:row.started_at,endedAt:row.completed_at,href:`/sessions/${row.id}/report`,
      details:hasScore?[`Existing PO score: ${(Number(score!.score)*100).toFixed(0)}% · ${score!.scored_exercise_count} scored exercises`,`${score!.progression_count} progression / ${score!.regression_count} regression outcomes`]:['PO coverage unavailable; no zero score inferred.'],
      signals:hasScore&&row.workout_id&&score!.baseline_count===0?[{key:`strength:${row.workout_id}:${score!.scored_exercise_count}`,label:`${row.workout_name_snapshot} · PO score (${score!.scored_exercise_count} scored exercises)`,value:Number(score!.score)*100,unit:'%',lowerIsBetter:false}]:[],
    });
  } else warnings.push('Strength history is temporarily unavailable.');
  if(cardioResult.status==='fulfilled') {
    const activities=(cardioResult.value as (Activity&{ended_at:string})[]).filter(activityKind);
    let segments:CardioSegmentRow[]=[];
    try {
      for(let index=0;index<activities.length;index+=100) {
        const ids=activities.slice(index,index+100).map(row=>row.id);
        segments.push(...await pages(offset=>client.from('cardio_activity_segments').select('id,cardio_activity_id,segment_key,segment_label,distance_meters,duration_seconds,start_offset_seconds,end_offset_seconds').eq('athlete_user_id',userId).in('cardio_activity_id',ids).order('id').range(offset,offset+199)) as CardioSegmentRow[]);
      }
    } catch {segments=[];warnings.push('Comparable cardio segments are temporarily unavailable.');}
    for(const row of activities) {
      const motion=averageMotion(row);
      training.push({id:row.id,label:activityLabel(row),startedAt:row.started_at,endedAt:row.ended_at,href:`/progress/activity/${row.id}`,
        details:[positive(row.distance_meters)?distanceText(row.distance_meters):null,positive(row.duration_seconds)?formatEffortTime(row.duration_seconds):null,motion?.value,positive(row.average_heart_rate_bpm)?`${Math.round(row.average_heart_rate_bpm)} bpm avg HR`:null].filter(Boolean) as string[],
        signals:segments.filter(segment=>segment.cardio_activity_id===row.id&&positive(segment.duration_seconds)).map(segment=>{
          const context=positive(row.distance_meters)&&row.distance_meters>segment.distance_meters*1.08?'inside longer activity':'standalone';
          return {key:`cardio:${row.source}:${comparableEffortIdentity(segment,row)}:${context}`,label:`${segment.segment_label} ${activityLabel(row)} · ${context}`,value:Number(segment.duration_seconds),unit:'seconds',lowerIsBetter:true};
        }),
      });
    }
  } else warnings.push('Cardio history is temporarily unavailable.');
  return {nights,training:training.sort((a,b)=>a.startedAt.localeCompare(b.startedAt)),warnings};
}
