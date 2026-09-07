import { createSupabaseBrowserClient } from '@/lib/supabase';
import { getNativeHealthSnapshot, type PhatbotHealthProvider } from '@/lib/health';
import { buildStandardizedCardioSegments } from '@/features/cardio/segments';

type SyncResult = {
  provider: Exclude<PhatbotHealthProvider, 'none'>;
  dailyMetrics: number;
  workouts: number;
  cardioSegments: number;
};

function sourceFor(provider: Exclude<PhatbotHealthProvider, 'none'>) {
  return provider === 'apple_health' ? 'healthkit' : 'health_connect';
}

function localDateKey(value: string) {
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sleepSecondsByDate(sleep: NonNullable<Awaited<ReturnType<typeof getNativeHealthSnapshot>>>['sleep']) {
  const totals = new Map<string, number>();
  for (const sample of sleep ?? []) {
    const key = localDateKey(sample.endDate);
    totals.set(key, (totals.get(key) ?? 0) + Number(sample.durationSeconds ?? 0));
  }
  return totals;
}

export async function syncNativeHealth(days = 14): Promise<SyncResult | null> {
  const snapshot = await getNativeHealthSnapshot(days);
  if (!snapshot) return null;

  const supabase = createSupabaseBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to sync health data.');

  const source = sourceFor(snapshot.provider);
  const sleepByDate = sleepSecondsByDate(snapshot.sleep);
  const daily = (snapshot.dailyMetrics ?? []).map((row) => ({
    athlete_user_id: user.id,
    metric_date: row.date,
    steps: row.steps == null ? null : Math.max(0, Math.round(Number(row.steps))),
    active_energy_kcal: row.activeEnergyKcal == null ? null : Math.max(0, Number(row.activeEnergyKcal)),
    sleep_seconds: sleepByDate.get(row.date) == null ? null : Math.max(0, Math.round(sleepByDate.get(row.date)!)),
    source,
  }));

  const today = localDateKey(new Date().toISOString());
  if (!daily.some((row) => row.metric_date === today)) {
    daily.push({
      athlete_user_id: user.id,
      metric_date: today,
      steps: snapshot.steps == null ? null : Math.max(0, Math.round(Number(snapshot.steps))),
      active_energy_kcal: snapshot.activeEnergyKcal == null ? null : Math.max(0, Number(snapshot.activeEnergyKcal)),
      sleep_seconds: sleepByDate.get(today) == null ? null : Math.max(0, Math.round(sleepByDate.get(today)!)),
      source,
    });
  }

  const latestIndex = daily.findIndex((row) => row.metric_date === today);
  if (latestIndex >= 0) {
    const row = daily[latestIndex] as typeof daily[number] & { resting_heart_rate_bpm?: number | null; hrv_ms?: number | null };
    row.resting_heart_rate_bpm = snapshot.restingHeartRate == null ? null : Number(snapshot.restingHeartRate);
    row.hrv_ms = snapshot.hrvMs == null ? null : Number(snapshot.hrvMs);
  }

  const nativeWorkouts = snapshot.workouts ?? [];
  const workouts = nativeWorkouts.map((workout) => ({
    athlete_user_id: user.id,
    source,
    source_workout_id: workout.sourceWorkoutId,
    activity_type: Number(workout.activityType),
    activity_name: workout.activityName ?? null,
    started_at: workout.startDate,
    ended_at: workout.endDate,
    duration_seconds: Math.max(0, Number(workout.durationSeconds)),
    distance_meters: workout.distanceMeters == null ? null : Math.max(0, Number(workout.distanceMeters)),
    active_energy_kcal: workout.activeEnergyKcal == null ? null : Math.max(0, Number(workout.activeEnergyKcal)),
    average_heart_rate_bpm: workout.averageHeartRateBpm == null ? null : Number(workout.averageHeartRateBpm),
  }));

  if (daily.length) {
    const { error } = await supabase.from('health_daily_metrics').upsert(daily, {
      onConflict: 'athlete_user_id,metric_date,source',
    });
    if (error) throw error;
  }

  let cardioSegments = 0;
  if (workouts.length) {
    const { data: savedWorkouts, error } = await supabase.from('cardio_activities').upsert(workouts, {
      onConflict: 'athlete_user_id,source,source_workout_id',
    }).select('id,source_workout_id');
    if (error) throw error;

    const activityIdBySourceId = new Map((savedWorkouts ?? []).map((row) => [row.source_workout_id, row.id]));
    const segments = nativeWorkouts.flatMap((workout) => {
      const cardioActivityId = activityIdBySourceId.get(workout.sourceWorkoutId);
      if (!cardioActivityId) return [];
      return buildStandardizedCardioSegments(workout.activityName, workout.distanceSamples).map((segment) => ({
        athlete_user_id: user.id,
        cardio_activity_id: cardioActivityId,
        segment_key: segment.key,
        segment_label: segment.label,
        distance_meters: segment.distanceMeters,
        duration_seconds: segment.durationSeconds,
        start_offset_seconds: segment.startOffsetSeconds,
        end_offset_seconds: segment.endOffsetSeconds,
        source,
        updated_at: new Date().toISOString(),
      }));
    });

    if (segments.length) {
      const { error: segmentError } = await supabase.from('cardio_activity_segments').upsert(segments, {
        onConflict: 'cardio_activity_id,segment_key',
      });
      if (segmentError) throw segmentError;
      cardioSegments = segments.length;
    }
  }

  return { provider: snapshot.provider, dailyMetrics: daily.length, workouts: workouts.length, cardioSegments };
}
