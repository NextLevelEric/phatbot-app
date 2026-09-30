import { buildComparableEffortGroups, describeEffortChange, describeEffortContext, formatEffortTime, type CardioActivityRow, type CardioSegmentRow } from './comparableEfforts';

export type Activity = CardioActivityRow & { source: string; active_energy_kcal: number | null };
export const MILE_METERS = 1609.344;
export const DAY_MS = 86400000;
export const positive = (value: number | null | undefined): value is number => value != null && Number.isFinite(Number(value)) && Number(value) > 0;

export function activityKind(activity: Pick<Activity, 'activity_name'>) {
  const name = (activity.activity_name ?? '').trim().toLowerCase();
  if (/\b(run|running)\b/.test(name)) return 'Run';
  if (/\b(walk|walking)\b/.test(name)) return 'Walk';
  if (/\b(bike|cycling|cycle|ride)\b/.test(name)) return 'Ride';
  if (/\b(hike|hiking)\b/.test(name)) return 'Hike';
  if (/\b(swim|swimming)\b/.test(name)) return 'Swim';
  if (/\b(row|rowing)\b/.test(name)) return 'Row';
  if (/elliptical|stair|mixed cardio|hiit/i.test(name)) return activity.activity_name!.trim();
  return null;
}
export const activityLabel = (activity: Pick<Activity, 'activity_name'>) => activityKind(activity) ?? activity.activity_name?.trim() ?? 'Activity';
export const activityIdentity = (activity: Activity) => `${activity.activity_type}:${activityLabel(activity).toLowerCase()}`;
export function distanceText(meters: number) { return `${(Number(meters) / MILE_METERS).toFixed(2)} mi`; }
export function averageMotion(activity: Activity) {
  if (!positive(activity.distance_meters) || !positive(activity.duration_seconds)) return null;
  const miles = Number(activity.distance_meters) / MILE_METERS;
  const kind = activityKind(activity);
  if (kind === 'Ride') return { label: 'Average speed', value: `${(miles * 3600 / Number(activity.duration_seconds)).toFixed(1)} mph` };
  if (kind === 'Run' || kind === 'Walk' || kind === 'Hike') return { label: 'Average pace', value: `${formatEffortTime(Number(activity.duration_seconds) / miles)}/mi` };
  return null;
}
export function sourceLabel(source: string) {
  return source === 'healthkit' ? 'Apple Health' : source === 'health_connect' ? 'Health Connect' : source || 'Recorded activity';
}

// As-of the workout, not today: later activities never change these comparisons.
export function activityMilestones(activity: Activity, history: Activity[]) {
  const end = Date.parse(activity.started_at), start = end - 30 * DAY_MS;
  const previous = history.filter(row => row.id !== activity.id && activityIdentity(row) === activityIdentity(activity)
    && Date.parse(row.started_at) >= start && Date.parse(row.started_at) < end);
  const distances = previous.filter(row => positive(row.distance_meters));
  const durations = previous.filter(row => positive(row.duration_seconds));
  const label = activityLabel(activity).toLowerCase();
  const milestones: string[] = [];
  if (positive(activity.distance_meters) && distances.length && distances.every(row => Number(row.distance_meters) < Number(activity.distance_meters))) {
    milestones.push(`Longest recorded ${label} distance in the preceding 30 days.`);
  }
  if (positive(activity.duration_seconds) && durations.length && durations.every(row => Number(row.duration_seconds) < Number(activity.duration_seconds))) {
    milestones.push(`Longest recorded ${label} duration in the preceding 30 days.`);
  }
  return milestones;
}

export function wholeActivitySummary(activity: Activity) {
  const parts: string[] = [];
  if (positive(activity.distance_meters)) parts.push(`You covered ${distanceText(activity.distance_meters)}`);
  if (positive(activity.duration_seconds)) parts.push(`${parts.length ? 'in' : 'Recorded duration:'} ${formatEffortTime(activity.duration_seconds)}`);
  const motion = averageMotion(activity);
  if (motion) parts.push(`at ${motion.value}`);
  if (positive(activity.average_heart_rate_bpm)) parts.push(`${parts.length ? 'with an' : 'Recorded'} average heart rate of ${Math.round(activity.average_heart_rate_bpm)} bpm`);
  return parts.length ? `${parts.join(' ')}.` : 'No distance, duration or heart-rate measurements were stored for this activity.';
}

export function reportSegments(activity: Activity, current: CardioSegmentRow[], previousSegments: CardioSegmentRow[], previousActivities: Activity[]) {
  const earlier = previousActivities.filter(row => Date.parse(row.started_at) < Date.parse(activity.started_at));
  const records = Object.fromEntries([...earlier, activity].map(row => [row.id, row]));
  const groups = buildComparableEffortGroups([...previousSegments, ...current], records);
  return current.filter(segment => positive(segment.duration_seconds) && positive(segment.distance_meters)).sort((a,b) => a.distance_meters - b.distance_meters).map(segment => {
    const group = groups.find(item => item.latest.segment.id === segment.id);
    const previous = group?.previous ?? null;
    return {
      segment, previous,
      context: describeEffortContext({ activity, segment }, activityLabel(activity)),
      change: previous ? describeEffortChange(segment.duration_seconds, previous.segment.duration_seconds) : 'No earlier comparable effort recorded.',
    };
  });
}

export function dashboardSummary(activities: Activity[], asOf: number) {
  const current = activities.filter(row => activityKind(row) && Date.parse(row.started_at) > asOf - 30 * DAY_MS && Date.parse(row.started_at) <= asOf);
  const previous = activities.filter(row => activityKind(row) && Date.parse(row.started_at) > asOf - 60 * DAY_MS && Date.parse(row.started_at) <= asOf - 30 * DAY_MS);
  const duration = (rows: Activity[]) => rows.reduce((sum,row) => sum + (positive(row.duration_seconds) ? Number(row.duration_seconds) : 0), 0);
  const distance = (rows: Activity[]) => rows.reduce((sum,row) => sum + (positive(row.distance_meters) ? Number(row.distance_meters) : 0), 0);
  const groups = [...new Set(current.map(activityIdentity))].map(key => {
    const rows = current.filter(row => activityIdentity(row) === key), prior = previous.filter(row => activityIdentity(row) === key);
    return { key, label: activityLabel(rows[0]), count: rows.length, seconds: duration(rows), meters: distance(rows), distanceCount: rows.filter(row => positive(row.distance_meters)).length, previousCount: prior.length, previousSeconds: duration(prior) };
  });
  const longest = [...current].filter(row => positive(row.duration_seconds)).sort((a,b) => b.duration_seconds - a.duration_seconds)[0] ?? null;
  return { count: current.length, seconds: duration(current), meters: distance(current), distanceCount: current.filter(row=>positive(row.distance_meters)).length, longest, groups };
}
