export type DistanceSample = {
  startOffsetSeconds: number;
  endOffsetSeconds: number;
  distanceMeters: number;
};

export type StandardizedCardioSegment = {
  key: string;
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  startOffsetSeconds: number;
  endOffsetSeconds: number;
};

const MILE_METERS = 1609.344;

const DISTANCE_TARGETS = [
  { suffix: '1mi', label: '1 Mile', meters: MILE_METERS },
  { suffix: '5k', label: '5K', meters: 5000 },
  { suffix: '10k', label: '10K', meters: 10000 },
] as const;

function activityKey(name: string | null | undefined) {
  return (name ?? '').trim().toLowerCase();
}

function benchmarkActivity(name: string | null | undefined): 'run' | 'walk' | 'hike' | null {
  const value = activityKey(name);
  if (value === 'run' || value.includes('running')) return 'run';
  if (value === 'walk' || value.includes('walking')) return 'walk';
  if (value === 'hike' || value.includes('hiking')) return 'hike';
  return null;
}

function cumulativePoints(samples: DistanceSample[]) {
  const clean = samples
    .map((sample) => ({
      startOffsetSeconds: Math.max(0, Number(sample.startOffsetSeconds)),
      endOffsetSeconds: Math.max(0, Number(sample.endOffsetSeconds)),
      distanceMeters: Math.max(0, Number(sample.distanceMeters)),
    }))
    .filter((sample) => sample.endOffsetSeconds > sample.startOffsetSeconds && sample.distanceMeters > 0)
    .sort((a, b) => a.endOffsetSeconds - b.endOffsetSeconds);

  const points: Array<{ time: number; distance: number }> = [{ time: 0, distance: 0 }];
  let total = 0;
  for (const sample of clean) {
    total += sample.distanceMeters;
    points.push({ time: sample.endOffsetSeconds, distance: total });
  }
  return points;
}

function timeAtDistance(points: Array<{ time: number; distance: number }>, targetDistance: number) {
  if (targetDistance <= 0) return 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (targetDistance > b.distance) continue;
    const span = b.distance - a.distance;
    if (span <= 0) return b.time;
    const ratio = (targetDistance - a.distance) / span;
    return a.time + ratio * (b.time - a.time);
  }
  return null;
}

function fastestWindow(points: Array<{ time: number; distance: number }>, targetMeters: number) {
  const totalDistance = points.at(-1)?.distance ?? 0;
  if (totalDistance < targetMeters) return null;

  let best: { durationSeconds: number; startOffsetSeconds: number; endOffsetSeconds: number } | null = null;
  for (const start of points) {
    const targetDistance = start.distance + targetMeters;
    if (targetDistance > totalDistance) break;
    const endTime = timeAtDistance(points, targetDistance);
    if (endTime == null || endTime <= start.time) continue;
    const durationSeconds = endTime - start.time;
    if (!best || durationSeconds < best.durationSeconds) {
      best = { durationSeconds, startOffsetSeconds: start.time, endOffsetSeconds: endTime };
    }
  }
  return best;
}

export function buildStandardizedCardioSegments(
  activityName: string | null | undefined,
  samples: DistanceSample[] | null | undefined,
): StandardizedCardioSegment[] {
  const activity = benchmarkActivity(activityName);
  if (!activity || !samples?.length) return [];
  const points = cumulativePoints(samples);
  return DISTANCE_TARGETS.flatMap((target) => {
    const best = fastestWindow(points, target.meters);
    if (!best) return [];
    return [{
      key: `${activity}-${target.suffix}`,
      label: target.label,
      distanceMeters: target.meters,
      ...best,
    }];
  });
}
