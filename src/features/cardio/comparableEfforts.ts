import type { SupabaseClient } from "@supabase/supabase-js";

export type CardioSegmentRow = {
  id: string;
  cardio_activity_id: string;
  segment_key: string;
  segment_label: string;
  distance_meters: number;
  duration_seconds: number;
  start_offset_seconds: number;
  end_offset_seconds: number;
};

export type CardioActivityRow = {
  id: string;
  activity_type: number;
  activity_name: string | null;
  started_at: string;
  distance_meters: number | null;
  duration_seconds: number;
  average_heart_rate_bpm: number | null;
};

export type ComparableEffort = {
  segment: CardioSegmentRow;
  activity: CardioActivityRow;
};

export type ComparableEffortGroup = {
  key: string;
  activityType: number;
  activitySlug: string;
  activityLabel: string;
  segmentKey: string;
  segmentLabel: string;
  displayLabel: string;
  efforts: ComparableEffort[];
  latest: ComparableEffort;
  previous: ComparableEffort | null;
  best: ComparableEffort;
};

const SEGMENT_SELECT = "id,cardio_activity_id,segment_key,segment_label,distance_meters,duration_seconds,start_offset_seconds,end_offset_seconds";
const ACTIVITY_SELECT = "id,activity_type,activity_name,started_at,distance_meters,duration_seconds,average_heart_rate_bpm";

function segmentActivitySlug(segmentKey: string) {
  return segmentKey.split("-")[0]?.trim().toLowerCase() || "activity";
}

function titleCase(value: string) {
  return value.replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

export function comparableEffortIdentity(segment: CardioSegmentRow, activity: CardioActivityRow) {
  return `${activity.activity_type}:${segment.segment_key}`;
}

export function comparableActivityLabel(segment: CardioSegmentRow, activity: CardioActivityRow) {
  const slug = segmentActivitySlug(segment.segment_key);
  if (slug === "run") return "Run";
  if (slug === "walk") return "Walk";
  if (slug === "hike") return "Hike";
  if (slug === "ride" || slug === "bike" || slug === "cycling") return "Ride";
  const name = activity.activity_name?.trim();
  return name ? titleCase(name.toLowerCase()) : "Activity";
}

export function buildComparableEffortGroups(
  segments: CardioSegmentRow[],
  activities: Record<string, CardioActivityRow>,
): ComparableEffortGroup[] {
  const grouped = new Map<string, ComparableEffort[]>();

  for (const segment of segments) {
    const activity = activities[segment.cardio_activity_id];
    if (!activity || Number(segment.duration_seconds) <= 0) continue;
    const key = comparableEffortIdentity(segment, activity);
    const efforts = grouped.get(key) ?? [];
    efforts.push({ segment, activity });
    grouped.set(key, efforts);
  }

  return [...grouped.entries()].map(([key, unordered]) => {
    const efforts = [...unordered].sort((left, right) => (
      new Date(left.activity.started_at).getTime() - new Date(right.activity.started_at).getTime()
      || left.segment.id.localeCompare(right.segment.id)
    ));
    const latest = efforts.at(-1)!;
    const previous = efforts.at(-2) ?? null;
    const best = [...efforts].sort((left, right) => (
      Number(left.segment.duration_seconds) - Number(right.segment.duration_seconds)
      || new Date(right.activity.started_at).getTime() - new Date(left.activity.started_at).getTime()
      || left.segment.id.localeCompare(right.segment.id)
    ))[0];
    const activityLabel = comparableActivityLabel(latest.segment, latest.activity);
    return {
      key,
      activityType: latest.activity.activity_type,
      activitySlug: segmentActivitySlug(latest.segment.segment_key),
      activityLabel,
      segmentKey: latest.segment.segment_key,
      segmentLabel: latest.segment.segment_label,
      displayLabel: `${latest.segment.segment_label} ${activityLabel}`,
      efforts,
      latest,
      previous,
      best,
    };
  }).sort((left, right) => (
    new Date(right.latest.activity.started_at).getTime() - new Date(left.latest.activity.started_at).getTime()
    || left.displayLabel.localeCompare(right.displayLabel)
    || left.key.localeCompare(right.key)
  ));
}

export function findComparableEffortGroup(
  groups: ComparableEffortGroup[],
  activityToken: string,
  segmentKey: string,
) {
  const normalizedToken = activityToken.trim().toLowerCase();
  return groups.find((group) => (
    group.segmentKey === segmentKey
    && (String(group.activityType) === normalizedToken || group.activitySlug === normalizedToken)
  )) ?? null;
}

export async function loadComparableEffortData(
  supabase: SupabaseClient,
  athleteUserId: string,
) {
  const segmentResult = await supabase
    .from("cardio_activity_segments")
    .select(SEGMENT_SELECT)
    .eq("athlete_user_id", athleteUserId)
    .order("created_at", { ascending: false })
    .limit(240);
  if (segmentResult.error) throw new Error("CARDIO_COMPARISON_UNAVAILABLE");

  const segments = (segmentResult.data ?? []) as CardioSegmentRow[];
  const activityIds = [...new Set(segments.map((segment) => segment.cardio_activity_id))];
  if (!activityIds.length) return { segments, activities: {} as Record<string, CardioActivityRow> };

  const activityResult = await supabase
    .from("cardio_activities")
    .select(ACTIVITY_SELECT)
    .eq("athlete_user_id", athleteUserId)
    .in("id", activityIds);
  if (activityResult.error) throw new Error("CARDIO_COMPARISON_UNAVAILABLE");

  const activityRows = (activityResult.data ?? []) as CardioActivityRow[];
  return {
    segments,
    activities: Object.fromEntries(activityRows.map((activity) => [activity.id, activity])),
  };
}

export function formatEffortTime(value: number) {
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function describeEffortChange(latestSeconds: number, previousSeconds: number) {
  const difference = Math.round(previousSeconds - latestSeconds);
  if (Math.abs(difference) <= 1) return "Essentially matched the previous effort.";
  const amount = Math.abs(difference) < 60
    ? `${Math.abs(difference)} second${Math.abs(difference) === 1 ? "" : "s"}`
    : formatEffortTime(Math.abs(difference));
  return difference > 0
    ? `${amount} faster than the previous effort.`
    : `${amount} slower than the previous effort.`;
}

export function describeEffortContext(effort: ComparableEffort, activityLabel: string) {
  const parentDistance = effort.activity.distance_meters;
  const isInsideLongerActivity = parentDistance != null
    && parentDistance > Number(effort.segment.distance_meters) * 1.08;
  if (!isInsideLongerActivity) return `Standalone ${activityLabel.toLowerCase()} effort`;
  const miles = parentDistance / 1609.344;
  return `${effort.segment.segment_label} inside a ${miles.toFixed(1)} mi ${activityLabel.toLowerCase()}`;
}
