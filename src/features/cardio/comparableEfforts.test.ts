import { describe, expect, it } from "vitest";
import {
  buildComparableEffortGroups,
  comparableEffortIdentity,
  describeEffortChange,
  findComparableEffortGroup,
  type CardioActivityRow,
  type CardioSegmentRow,
} from "./comparableEfforts";

const activity = (
  id: string,
  activityType: number,
  name: string,
  startedAt: string,
): CardioActivityRow => ({
  id,
  activity_type: activityType,
  activity_name: name,
  started_at: startedAt,
  distance_meters: 5000,
  duration_seconds: 2000,
  average_heart_rate_bpm: 150,
});

const segment = (
  id: string,
  activityId: string,
  key: string,
  label: string,
  duration: number,
): CardioSegmentRow => ({
  id,
  cardio_activity_id: activityId,
  segment_key: key,
  segment_label: label,
  distance_meters: key.endsWith("5k") ? 5000 : 1609.344,
  duration_seconds: duration,
  start_offset_seconds: 0,
  end_offset_seconds: duration,
});

function fixtures() {
  const activities = {
    run5a: activity("run5a", 37, "Run", "2026-09-01T12:00:00Z"),
    run5b: activity("run5b", 37, "Running", "2026-09-08T12:00:00Z"),
    run1a: activity("run1a", 37, "Run", "2026-09-02T12:00:00Z"),
    run1b: activity("run1b", 37, "Run", "2026-09-09T12:00:00Z"),
    walk1a: activity("walk1a", 52, "Walk", "2026-09-03T12:00:00Z"),
    walk1b: activity("walk1b", 52, "Walking", "2026-09-10T12:00:00Z"),
  };
  const segments = [
    segment("s-run5a", "run5a", "run-5k", "5K", 2062),
    segment("s-run5b", "run5b", "run-5k", "5K", 2021),
    segment("s-run1a", "run1a", "run-1mi", "1 Mile", 620),
    segment("s-run1b", "run1b", "run-1mi", "1 Mile", 600),
    segment("s-walk1a", "walk1a", "walk-1mi", "1 Mile", 1200),
    segment("s-walk1b", "walk1b", "walk-1mi", "1 Mile", 1170),
  ];
  return { activities, segments };
}

describe("canonical cardio comparable efforts", () => {
  it("uses the persisted Cardio Bunny identity: activity type plus segment key", () => {
    const { activities, segments } = fixtures();
    expect(comparableEffortIdentity(segments[0], activities.run5a)).toBe("37:run-5k");
  });

  it("returns the same two 5K efforts represented by the summary count", () => {
    const { activities, segments } = fixtures();
    const group = findComparableEffortGroup(buildComparableEffortGroups(segments, activities), "run", "run-5k");
    expect(group?.displayLabel).toBe("5K Run");
    expect(group?.efforts).toHaveLength(2);
    expect(group?.efforts.map((effort) => effort.segment.id)).toEqual(["s-run5a", "s-run5b"]);
  });

  it("keeps one-mile runs separate and returns their exact comparable set", () => {
    const { activities, segments } = fixtures();
    const group = findComparableEffortGroup(buildComparableEffortGroups(segments, activities), "37", "run-1mi");
    expect(group?.displayLabel).toBe("1 Mile Run");
    expect(group?.efforts.map((effort) => effort.segment.id)).toEqual(["s-run1a", "s-run1b"]);
  });

  it("keeps walks separate from runs even when the distance label matches", () => {
    const { activities, segments } = fixtures();
    const groups = buildComparableEffortGroups(segments, activities);
    const walk = findComparableEffortGroup(groups, "walk", "walk-1mi");
    expect(walk?.displayLabel).toBe("1 Mile Walk");
    expect(walk?.efforts).toHaveLength(2);
    expect(groups.find((group) => group.key === "37:run-1mi")?.efforts).toHaveLength(2);
    expect(groups.find((group) => group.key === "52:walk-1mi")?.efforts).toHaveLength(2);
  });

  it("does not include a one-mile effort in a 5K trend", () => {
    const { activities, segments } = fixtures();
    const group = findComparableEffortGroup(buildComparableEffortGroups(segments, activities), "run", "run-5k");
    expect(group?.efforts.every((effort) => effort.segment.segment_key === "run-5k")).toBe(true);
  });

  it("orders latest and previous efforts by their activity timestamps", () => {
    const { activities, segments } = fixtures();
    const group = findComparableEffortGroup(buildComparableEffortGroups([...segments].reverse(), activities), "run", "run-5k");
    expect(group?.latest.segment.id).toBe("s-run5b");
    expect(group?.previous?.segment.id).toBe("s-run5a");
  });

  it("preserves a one-effort group for the baseline empty state", () => {
    const { activities, segments } = fixtures();
    const groups = buildComparableEffortGroups([segments[0]], activities);
    expect(groups[0].efforts).toHaveLength(1);
    expect(groups[0].previous).toBeNull();
  });

  it("uses positive language for faster and slower time changes", () => {
    expect(describeEffortChange(1978, 2021)).toBe("43 seconds faster than the previous effort.");
    expect(describeEffortChange(2061, 2021)).toBe("40 seconds slower than the previous effort.");
  });
});
