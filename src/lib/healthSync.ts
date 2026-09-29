import { createSupabaseBrowserClient } from '@/lib/supabase';
import { getNativeHealthSnapshot, type PhatbotHealthProvider, type PhatbotHealthSnapshot } from '@/lib/health';
import { buildStandardizedCardioSegments } from '@/features/cardio/segments';

export type SyncResult = {
  provider: Exclude<PhatbotHealthProvider, 'none'>;
  dailyMetrics: number;
  workouts: number;
  cardioSegments: number;
  status: 'synced' | 'empty';
  syncedAt: string | null;
  warnings: string[];
  snapshot: PhatbotHealthSnapshot;
};

type Counts = Pick<SyncResult, 'dailyMetrics' | 'workouts' | 'cardioSegments'>;
export class HealthSyncError extends Error {
  constructor(public readonly stage: string, public readonly saved: Counts, message: string) { super(message); }
}
const activeSyncs = new Map<string, Promise<SyncResult | null>>();
const emptyCounts = (): Counts => ({ dailyMetrics: 0, workouts: 0, cardioSegments: 0 });
export function healthSyncErrorMessage(error: unknown) {
  if (error instanceof HealthSyncError) return error.message;
  return 'PHATBOT could not finish the health sync. Check your connection and Health permissions, then try again. Previously saved history is safe.';
}
export function healthSyncSummary(result: SyncResult) {
  if (result.status === 'empty') return 'No readable health records were found. 0 daily records, 0 workouts, and 0 cardio segments saved. Check PHATBOT access in your Health settings and confirm the data is within the last 14 days.';
  const counts = `Saved or updated ${result.dailyMetrics} daily records, ${result.workouts} workouts, and ${result.cardioSegments} cardio segments.`;
  return [counts, result.workouts === 0 ? 'No workouts were returned by your device. If workouts are missing, check Health permissions and their dates.' : '', ...result.warnings].filter(Boolean).join(' ');
}
function localDateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function numberOrNull(value: number | null | undefined) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid native quantity');
  return value;
}
function validDate(value: string) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }

// Every UI calls this entry point. Concurrent callers for one signed-in athlete
// share a request; repeating a finished request uses the stable database keys.
export async function syncNativeHealth(days = 14): Promise<SyncResult | null> {
  const supabase = createSupabaseBrowserClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new HealthSyncError('auth', emptyCounts(), 'Sign in again before syncing health data.');
  const existing = activeSyncs.get(user.id);
  if (existing) return existing;
  const pending = performSync(supabase, user.id, days);
  activeSyncs.set(user.id, pending);
  try { return await pending; }
  finally { if (activeSyncs.get(user.id) === pending) activeSyncs.delete(user.id); }
}

async function performSync(supabase: ReturnType<typeof createSupabaseBrowserClient>, userId: string, days: number): Promise<SyncResult | null> {
  const saved = emptyCounts();
  let stage = 'read';
  try {
    const snapshot = await getNativeHealthSnapshot(days);
    if (!snapshot) return null;
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || user?.id !== userId) throw new HealthSyncError('auth', saved, 'Your sign-in changed. Sign in again before syncing health data.');
    const source = snapshot.provider === 'apple_health' ? 'healthkit' : 'health_connect';
    stage = 'validate';
    const nativeWorkouts = [...new Map((snapshot.workouts ?? []).map(row => [row.sourceWorkoutId, row])).values()];
    const workouts = nativeWorkouts.map(workout => {
      if (!workout.sourceWorkoutId || !Number.isInteger(workout.activityType) || !validDate(workout.startDate) || !validDate(workout.endDate) || Date.parse(workout.endDate) < Date.parse(workout.startDate) || workout.durationSeconds == null) throw new Error('Invalid native workout');
      return {
        athlete_user_id: userId, source, source_workout_id: workout.sourceWorkoutId,
        activity_type: workout.activityType, activity_name: workout.activityName ?? null,
        started_at: workout.startDate, ended_at: workout.endDate,
        duration_seconds: numberOrNull(workout.durationSeconds), distance_meters: numberOrNull(workout.distanceMeters),
        active_energy_kcal: numberOrNull(workout.activeEnergyKcal), average_heart_rate_bpm: numberOrNull(workout.averageHeartRateBpm),
      };
    });
    const sleepByDate = new Map<string, number>();
    for (const sample of snapshot.sleep ?? []) {
      if (!validDate(sample.endDate)) throw new Error('Invalid native sleep date');
      const date = localDateKey(sample.endDate);
      sleepByDate.set(date, (sleepByDate.get(date) ?? 0) + (numberOrNull(sample.durationSeconds) ?? 0));
    }
    const dailyByDate = new Map((snapshot.dailyMetrics ?? []).map(row => [row.date, {
      athlete_user_id: userId, source, metric_date: row.date,
      steps: row.steps == null ? null : Math.round(numberOrNull(row.steps)!),
      active_energy_kcal: numberOrNull(row.activeEnergyKcal),
      sleep_seconds: sleepByDate.has(row.date) ? Math.round(sleepByDate.get(row.date)!) : null,
      resting_heart_rate_bpm: null as number | null, hrv_ms: null as number | null,
    }]));
    for (const [date, seconds] of sleepByDate) {
      if (!dailyByDate.has(date)) dailyByDate.set(date, { athlete_user_id:userId, source, metric_date:date, steps:null, active_energy_kcal:null, sleep_seconds:Math.round(seconds), resting_heart_rate_bpm:null, hrv_ms:null });
    }
    // Snapshot.steps/activeEnergyKcal are WINDOW totals, not today's values.
    // Never write a 14-day total into today's daily metrics.
    const today = localDateKey(new Date().toISOString());
    if ((snapshot.restingHeartRate ?? 0) > 0 || (snapshot.hrvMs ?? 0) > 0) {
      const row = dailyByDate.get(today) ?? { athlete_user_id:userId, source, metric_date:today, steps:null, active_energy_kcal:null, sleep_seconds:null, resting_heart_rate_bpm:null, hrv_ms:null };
      row.resting_heart_rate_bpm = numberOrNull(snapshot.restingHeartRate);
      row.hrv_ms = numberOrNull(snapshot.hrvMs);
      dailyByDate.set(today,row);
    }
    const daily = [...dailyByDate.values()];
    for (const row of daily) if (!/^\d{4}-\d{2}-\d{2}$/.test(row.metric_date) || !validDate(row.metric_date) || new Date(row.metric_date).toISOString().slice(0,10) !== row.metric_date) throw new Error('Invalid native day');
    // HealthKit conceals read denial as empty results/zero aggregates. Do not
    // overwrite history or stamp success on an entirely unreadable snapshot.
    const nativeWarnings = (snapshot.readWarnings ?? []).map(warning => `Health read warning: ${warning}`);
    const hasReadableData = workouts.length > 0 || daily.some(row => [row.steps,row.active_energy_kcal,row.sleep_seconds,row.resting_heart_rate_bpm,row.hrv_ms].some(value => (value ?? 0) > 0));
    if (!hasReadableData) return { ...saved, provider:snapshot.provider, status:'empty', syncedAt:null, warnings:nativeWarnings, snapshot };

    stage = 'daily records';
    if (daily.length) {
      const { data: previous, error } = await supabase.from('health_daily_metrics').select('metric_date,steps,active_energy_kcal,sleep_seconds,resting_heart_rate_bpm,hrv_ms').eq('athlete_user_id',userId).eq('source',source).in('metric_date',daily.map(row=>row.metric_date));
      if (error) throw error;
      const byDate = new Map((previous ?? []).map(row=>[row.metric_date,row]));
      const merged = daily.map(row => {
        const prior = byDate.get(row.metric_date);
        return { ...row,
          // Zero aggregates can also mean a revoked read permission. Preserve a
          // known positive value rather than silently erase it during recovery.
          steps: row.steps === 0 && (prior?.steps ?? 0) > 0 ? prior!.steps : row.steps ?? prior?.steps ?? null,
          active_energy_kcal: row.active_energy_kcal === 0 && (prior?.active_energy_kcal ?? 0) > 0 ? prior!.active_energy_kcal : row.active_energy_kcal ?? prior?.active_energy_kcal ?? null,
          sleep_seconds: row.sleep_seconds ?? prior?.sleep_seconds ?? null,
          resting_heart_rate_bpm: row.resting_heart_rate_bpm ?? prior?.resting_heart_rate_bpm ?? null,
          hrv_ms: row.hrv_ms ?? prior?.hrv_ms ?? null,
        };
      });
      const result = await supabase.from('health_daily_metrics').upsert(merged,{onConflict:'athlete_user_id,metric_date,source'}).select('metric_date');
      if (result.error || new Set((result.data ?? []).map(row=>row.metric_date)).size !== daily.length) throw new Error('Daily save not confirmed');
      saved.dailyMetrics = daily.length;
    }
    stage = 'workouts';
    if (workouts.length) {
      const { data: previous, error: readError } = await supabase.from('cardio_activities').select('source_workout_id,distance_meters,active_energy_kcal,average_heart_rate_bpm').eq('athlete_user_id',userId).eq('source',source).in('source_workout_id',workouts.map(row=>row.source_workout_id));
      if (readError) throw readError;
      const previousById = new Map((previous ?? []).map(row=>[row.source_workout_id,row]));
      const merged = workouts.map(row=>({ ...row,
        distance_meters: row.distance_meters ?? previousById.get(row.source_workout_id)?.distance_meters ?? null,
        active_energy_kcal: row.active_energy_kcal ?? previousById.get(row.source_workout_id)?.active_energy_kcal ?? null,
        average_heart_rate_bpm: row.average_heart_rate_bpm ?? previousById.get(row.source_workout_id)?.average_heart_rate_bpm ?? null,
      }));
      const { data, error } = await supabase.from('cardio_activities').upsert(merged,{onConflict:'athlete_user_id,source,source_workout_id'}).select('id,source_workout_id');
      if (error) throw error;
      const ids = new Map((data ?? []).map(row=>[row.source_workout_id,row.id]));
      if (workouts.some(row=>!ids.get(row.source_workout_id))) throw new Error('Workout save not confirmed');
      saved.workouts = ids.size;
      const segments = nativeWorkouts.flatMap(workout=>buildStandardizedCardioSegments(workout.activityName,workout.distanceSamples).map(segment=>({
        athlete_user_id:userId, cardio_activity_id:ids.get(workout.sourceWorkoutId), segment_key:segment.key, segment_label:segment.label,
        distance_meters:segment.distanceMeters, duration_seconds:segment.durationSeconds, start_offset_seconds:segment.startOffsetSeconds,
        end_offset_seconds:segment.endOffsetSeconds, source, updated_at:new Date().toISOString(),
      })));
      stage = 'cardio segments';
      if (segments.length) {
        const result = await supabase.from('cardio_activity_segments').upsert(segments,{onConflict:'cardio_activity_id,segment_key'}).select('cardio_activity_id,segment_key');
        if (result.error || result.data?.length !== segments.length) throw new Error('Segment save not confirmed');
        saved.cardioSegments = segments.length;
      }
    }
    stage = 'sync status';
    const syncedAt = new Date().toISOString();
    // Keep the live connection-status consumer; legacy raw tables remain intact.
    const { error: connectionError } = await supabase.from('athlete_health_connections').upsert({athlete_user_id:userId,provider:snapshot.provider,last_synced_at:syncedAt,updated_at:syncedAt},{onConflict:'athlete_user_id'});
    if (connectionError) throw connectionError;
    const warnings: string[] = [...nativeWarnings];
    try {
      const { error } = await supabase.rpc('phatbot_competition_lifecycle');
      if (error) warnings.push('Health data is saved, but competition standings could not refresh yet.');
    } catch { warnings.push('Health data is saved, but competition standings could not refresh yet.'); }
    return { ...saved, provider:snapshot.provider, status:'synced', syncedAt, warnings, snapshot };
  } catch (error) {
    if (error instanceof HealthSyncError) throw error;
    if (stage === 'read') throw new HealthSyncError(stage,{...saved},'PHATBOT could not read your health data. Check PHATBOT permissions in Apple Health or Health Connect, then try Sync Health Data again.');
    throw new HealthSyncError(stage,{...saved},`Health sync did not finish (${stage}). Confirmed so far: ${saved.dailyMetrics} daily records, ${saved.workouts} workouts, ${saved.cardioSegments} cardio segments. Some records may already be saved; retrying safely updates the same records.`);
  }
}
