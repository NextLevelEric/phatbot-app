import { describe, expect, it } from "vitest";
import { isExactWeeklyReportStart, latestFinalizableWeeklyReportPeriod, weeklyReportPeriodForInstant } from "./periods";

describe("Sunday weekly report periods", () => {
  it("uses Sunday midnight through the next Sunday midnight in Eastern time", () => {
    const period = weeklyReportPeriodForInstant(new Date("2026-01-14T18:00:00Z"));
    expect(period.startsAt.toISOString()).toBe("2026-01-11T05:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-01-18T05:00:00.000Z");
    expect(period.readyAt.toISOString()).toBe("2026-01-18T17:30:00.000Z");
  });

  it("uses IANA offsets across spring DST", () => {
    const period = weeklyReportPeriodForInstant(new Date("2026-03-11T12:00:00Z"));
    expect(period.startsAt.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-03-15T04:00:00.000Z");
    expect(period.readyAt.toISOString()).toBe("2026-03-15T16:30:00.000Z");
    expect(period.endsAt.getTime() - period.startsAt.getTime()).toBe(167 * 60 * 60 * 1000);
  });

  it("uses IANA offsets across fall DST", () => {
    const period = weeklyReportPeriodForInstant(new Date("2026-11-04T12:00:00Z"));
    expect(period.startsAt.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-11-08T05:00:00.000Z");
    expect(period.readyAt.toISOString()).toBe("2026-11-08T17:30:00.000Z");
    expect(period.endsAt.getTime() - period.startsAt.getTime()).toBe(169 * 60 * 60 * 1000);
  });

  it("selects the previous week before Sunday finalization and the completed week after", () => {
    expect(latestFinalizableWeeklyReportPeriod(new Date("2026-01-18T17:29:59Z")).startsAt.toISOString()).toBe("2026-01-04T05:00:00.000Z");
    expect(latestFinalizableWeeklyReportPeriod(new Date("2026-01-18T17:30:00Z")).startsAt.toISOString()).toBe("2026-01-11T05:00:00.000Z");
  });

  it("recognizes only an exact Sunday Eastern midnight start", () => {
    expect(isExactWeeklyReportStart(new Date("2026-01-11T05:00:00Z"))).toBe(true);
    expect(isExactWeeklyReportStart(new Date("2026-01-11T05:00:01Z"))).toBe(false);
  });
});
