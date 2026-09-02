import { describe, expect, it } from "vitest";
import {
  COMPETITION_CADENCES,
  COMPETITION_CATEGORIES,
  COMPETITION_TIME_ZONE,
  competitionPeriodForInstant,
  isInstantInCompetitionPeriod,
  supportedCadencesForCategory,
} from "./periods";

describe("PHATBOT competition periods", () => {
  it("supports daily and weekly periods for every competition category", () => {
    for (const category of COMPETITION_CATEGORIES) {
      expect(supportedCadencesForCategory(category)).toEqual(COMPETITION_CADENCES);
    }
  });

  it("creates a normal Eastern daily period with a following-day noon reconciliation deadline", () => {
    const period = competitionPeriodForInstant("daily", new Date("2026-01-15T18:30:00.000Z"));

    expect(period.timeZone).toBe(COMPETITION_TIME_ZONE);
    expect(period.startsAt.toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-01-16T05:00:00.000Z");
    expect(period.reconciliationEndsAt.toISOString()).toBe("2026-01-16T17:00:00.000Z");
  });

  it("uses half-open period boundaries", () => {
    const period = competitionPeriodForInstant("daily", new Date("2026-01-15T18:30:00.000Z"));

    expect(isInstantInCompetitionPeriod(period.startsAt, period)).toBe(true);
    expect(isInstantInCompetitionPeriod(new Date(period.endsAt.getTime() - 1), period)).toBe(true);
    expect(isInstantInCompetitionPeriod(period.endsAt, period)).toBe(false);
  });

  it("creates a 23-hour daily period across the spring DST transition", () => {
    const period = competitionPeriodForInstant("daily", new Date("2026-03-08T16:00:00.000Z"));

    expect(period.startsAt.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(period.reconciliationEndsAt.toISOString()).toBe("2026-03-09T16:00:00.000Z");
    expect(period.endsAt.getTime() - period.startsAt.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("creates a 25-hour daily period across the fall DST transition", () => {
    const period = competitionPeriodForInstant("daily", new Date("2026-11-01T17:00:00.000Z"));

    expect(period.startsAt.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(period.reconciliationEndsAt.toISOString()).toBe("2026-11-02T17:00:00.000Z");
    expect(period.endsAt.getTime() - period.startsAt.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("creates the Sunday-through-Saturday week containing a midweek instant", () => {
    const period = competitionPeriodForInstant("weekly", new Date("2026-01-14T18:30:00.000Z"));

    expect(period.startsAt.toISOString()).toBe("2026-01-11T05:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-01-18T05:00:00.000Z");
    expect(period.reconciliationEndsAt.toISOString()).toBe("2026-01-18T17:00:00.000Z");
  });

  it("uses IANA offsets for the spring DST competition week", () => {
    const period = competitionPeriodForInstant("weekly", new Date("2026-03-11T12:00:00.000Z"));

    expect(period.startsAt.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-03-15T04:00:00.000Z");
    expect(period.reconciliationEndsAt.toISOString()).toBe("2026-03-15T16:00:00.000Z");
    expect(period.endsAt.getTime() - period.startsAt.getTime()).toBe(167 * 60 * 60 * 1000);
  });

  it("uses IANA offsets for the fall DST competition week", () => {
    const period = competitionPeriodForInstant("weekly", new Date("2026-11-04T12:00:00.000Z"));

    expect(period.startsAt.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-11-08T05:00:00.000Z");
    expect(period.reconciliationEndsAt.toISOString()).toBe("2026-11-08T17:00:00.000Z");
    expect(period.endsAt.getTime() - period.startsAt.getTime()).toBe(169 * 60 * 60 * 1000);
  });
});
