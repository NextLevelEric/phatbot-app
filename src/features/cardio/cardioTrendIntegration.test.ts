import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r/g, "");
const helper = read("src/features/cardio/comparableEfforts.ts");
const summary = read("src/components/CardioSegmentProgress.tsx");
const detail = read("src/app/progress/activity/benchmark/[type]/[segment]/page.tsx");
const panel = read("src/components/CardioTrendPanel.tsx");
const activityPage = read("src/app/progress/activity/page.tsx");
const activityLayout = read("src/app/progress/activity/layout.tsx");
const cardioBunny = read("supabase/migrations/20260908_230_cardio_bunny_segment_scoring_v4.sql");

describe("cardio trend integration", () => {
  it("uses one loader and grouping contract in the summary and detail route", () => {
    for (const consumer of [summary, detail]) {
      expect(consumer).toContain("loadComparableEffortData");
      expect(consumer).toContain("buildComparableEffortGroups");
      expect(consumer).toContain("CardioTrendPanel");
    }
  });

  it("queries the real heart-rate column and never the obsolete name", () => {
    expect(helper).toContain("average_heart_rate_bpm");
    expect(helper).not.toMatch(/average_heart_rate(?!_bpm)/);
    expect(detail).not.toMatch(/average_heart_rate(?!_bpm)/);
  });

  it("renders combined activity and distance labels without duplicate summary cards", () => {
    expect(summary).toContain("group.displayLabel");
    expect(summary).not.toContain("View trend");
    expect(summary).not.toContain("/benchmark/");
    expect(panel).toContain("Effort history");
  });

  it("keeps progression within the Activity hierarchy rather than every nested route", () => {
    expect(activityPage).toContain("<CardioSegmentProgress />");
    expect(activityLayout).not.toContain("CardioSegmentProgress");
  });

  it("preserves the authoritative Cardio Bunny identity and scoring migration", () => {
    expect(helper).toContain("`${activity.activity_type}:${segment.segment_key}`");
    expect(cardioBunny).toContain("pseg.segment_key=c.segment_key");
    expect(cardioBunny).toContain("pa.activity_type=c.activity_type");
  });
});
