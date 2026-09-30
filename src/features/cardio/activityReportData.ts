import type { SupabaseClient } from '@supabase/supabase-js';
import type { CardioSegmentRow } from './comparableEfforts';
import { DAY_MS, type Activity } from './activityReport';

export const ACTIVITY_FIELDS = 'id,activity_type,activity_name,started_at,distance_meters,duration_seconds,average_heart_rate_bpm,active_energy_kcal,source';
const SEGMENT_FIELDS = 'id,cardio_activity_id,segment_key,segment_label,distance_meters,duration_seconds,start_offset_seconds,end_offset_seconds';
const PAGE_SIZE = 200;

// Read the full bounded window, not a silently capped sample used for milestones.
export async function loadActivityWindow(client: SupabaseClient, userId: string, from: string, through: string, type?: number) {
  const rows: Activity[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = client.from('cardio_activities').select(ACTIVITY_FIELDS).eq('athlete_user_id', userId)
      .gte('started_at', from).lte('started_at', through).order('started_at', { ascending: false }).order('id', { ascending: false });
    if (type != null) query = query.eq('activity_type', type);
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error('ACTIVITY_HISTORY_UNAVAILABLE');
    rows.push(...(data ?? []) as Activity[]);
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

export async function loadActivityReport(client: SupabaseClient, userId: string, activityId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activityId)) return null;
  const { data, error } = await client.from('cardio_activities').select(ACTIVITY_FIELDS).eq('athlete_user_id', userId).eq('id', activityId).maybeSingle();
  if (error) throw new Error('ACTIVITY_UNAVAILABLE');
  if (!data) return null;
  const activity = data as Activity;
  const [historyResult, segmentResult] = await Promise.allSettled([
    loadActivityWindow(client, userId, new Date(Date.parse(activity.started_at) - 30 * DAY_MS).toISOString(), activity.started_at, activity.activity_type),
    client.from('cardio_activity_segments').select(SEGMENT_FIELDS).eq('athlete_user_id', userId).eq('cardio_activity_id', activity.id).order('distance_meters'),
  ]);
  const history = historyResult.status === 'fulfilled' ? historyResult.value : null;
  const segments = segmentResult.status === 'fulfilled' && !segmentResult.value.error ? (segmentResult.value.data ?? []) as CardioSegmentRow[] : null;
  const previousSegments: CardioSegmentRow[] = [], previousActivities: Activity[] = [];
  let comparisonsAvailable = segments !== null;
  // Query the immediate earlier matching effort, even when it is older than the
  // milestone window or the dashboard's progression loader's 240-row sample.
  if (segments) {
    const results = await Promise.allSettled(segments.map(async segment => {
      const result = await client.from('cardio_activity_segments')
        .select(`${SEGMENT_FIELDS},cardio_activities!inner(${ACTIVITY_FIELDS})`)
        .eq('athlete_user_id', userId).eq('cardio_activities.athlete_user_id', userId)
        .eq('segment_key', segment.segment_key).eq('distance_meters', segment.distance_meters)
        .gt('duration_seconds', 0)
        .eq('cardio_activities.activity_type', activity.activity_type)
        .lt('cardio_activities.started_at', activity.started_at)
        .order('cardio_activities(started_at)', { ascending: false }).order('id', { ascending: false }).limit(1);
      if (result.error) throw new Error('COMPARISON_UNAVAILABLE');
      return result.data?.[0] as unknown as (CardioSegmentRow & { cardio_activities: Activity }) | undefined;
    }));
    for (const result of results) {
      if (result.status === 'rejected') comparisonsAvailable = false;
      else if (result.value) { previousSegments.push(result.value); previousActivities.push(result.value.cardio_activities); }
    }
  }
  return { activity, history, segments, previousSegments, previousActivities, comparisonsAvailable };
}
export type ActivityReportData = NonNullable<Awaited<ReturnType<typeof loadActivityReport>>>;
