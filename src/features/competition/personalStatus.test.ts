import { describe, expect, it } from "vitest";
import {
  buildBeastStatusPair,
  buildPersonalCompetitionStatus,
  selectAroundYouRows,
  type CompetitionCadence,
  type CompetitionLeaderboardRow,
  type CompetitionPeriodRecord,
} from "./personalStatus";

function period(cadence: CompetitionCadence, status: CompetitionPeriodRecord["status"] = "open"): CompetitionPeriodRecord {
  return {
    id: `${cadence}-period`,
    competition: "beast",
    cadence,
    period_start: cadence === "daily" ? "2026-09-11T04:00:00Z" : "2026-09-07T04:00:00Z",
    period_end: cadence === "daily" ? "2026-09-12T04:00:00Z" : "2026-09-13T16:00:00Z",
    reconcile_at: cadence === "daily" ? "2026-09-12T16:00:00Z" : "2026-09-13T16:05:00Z",
    status,
  };
}

function row(id: string, rank: number, score: number, isMe = false): CompetitionLeaderboardRow {
  return {
    rank,
    athlete_user_id: id,
    display_name: isMe ? "YOU" : `Athlete ${id}`,
    score,
    result_label: `${score >= 0 ? "+" : ""}${score}% volume`,
    is_me: isMe,
  };
}

function beast(
  rows: readonly CompetitionLeaderboardRow[],
  cadence: CompetitionCadence = "daily",
  status: CompetitionPeriodRecord["status"] = "open",
) {
  return buildPersonalCompetitionStatus("beast", cadence, {
    state: "success",
    period: period(cadence, status),
    rows,
  });
}

describe("personal competition status", () => {
  it("describes an athlete alone in first place", () => {
    const status = beast([row("me", 1, 8.4, true), row("second", 2, 6.7)]);

    expect(status.state).toBe("ranked");
    expect(status.athlete).toMatchObject({ rank: 1, score: 8.4, tiedAtRank: false });
    expect(status.nextHigherScoreGroup).toBeNull();
    expect(status.exactGap).toBeNull();
    expect(status.gapCopy).toBe("You currently hold the top score.");
  });

  it("finds the next distinct score for an athlete in the middle", () => {
    const status = beast([
      row("first", 1, 10.1),
      row("second", 2, 8.4),
      row("me", 3, 6.7, true),
      row("fourth", 4, 4.5),
    ]);

    expect(status.athlete?.rank).toBe(3);
    expect(status.nextHigherScoreGroup).toEqual({ rank: 2, score: 8.4, athleteCount: 1 });
    expect(status.exactGap).toBe(1.7);
    expect(status.gapUnit).toBe("percentage_points");
    expect(status.gapCopy).toBe("You're 1.7 percentage points behind the next score.");
  });

  it("preserves a true tie without using display order to break it", () => {
    const status = beast([
      row("first", 1, 9),
      row("me", 2, 7.5, true),
      row("same-score-before-me", 2, 7.5),
      row("fourth", 4, 5),
    ]);

    expect(status.athlete).toMatchObject({ rank: 2, tiedAtRank: true });
    expect(status.positionCopy).toBe("You're tied for 2nd of 4 ranked athletes.");
    expect(status.nextHigherScoreGroup).toEqual({ rank: 1, score: 9, athleteCount: 1 });
  });

  it("finds the athlete and next score when the athlete is outside the top ten", () => {
    const rows = Array.from({ length: 12 }, (_, index) => row(
      index === 11 ? "me" : `athlete-${index + 1}`,
      index + 1,
      12 - index,
      index === 11,
    ));
    const status = beast(rows);

    expect(status.athlete?.rank).toBe(12);
    expect(status.rankedAthleteCount).toBe(12);
    expect(status.nextHigherScoreGroup).toEqual({ rank: 11, score: 2, athleteCount: 1 });
    expect(status.exactGap).toBe(1);
  });

  it("treats a tied next score as one distinct score group", () => {
    const status = beast([
      row("leader", 1, 12),
      row("next-a", 2, 8.4),
      row("next-b", 2, 8.4),
      row("me", 4, 6.7, true),
    ]);

    expect(status.nextHigherScoreGroup).toEqual({ rank: 2, score: 8.4, athleteCount: 2 });
    expect(status.exactGap).toBe(1.7);
  });

  it("handles an only eligible athlete", () => {
    const status = beast([row("me", 1, 3.2, true)]);

    expect(status.positionCopy).toBe("You're 1st of 1 ranked athlete.");
    expect(status.gapCopy).toBe("You currently hold the top score.");
  });

  it("distinguishes a genuinely empty board", () => {
    const status = beast([]);

    expect(status.state).toBe("empty");
    expect(status.rankedAthleteCount).toBe(0);
    expect(status.positionCopy).toBe("No athletes have an eligible Beast result today yet.");
    expect(status.gapCopy).toBe("Complete an eligible workout to enter today's standings.");
  });

  it("distinguishes an unranked athlete from an empty board", () => {
    const status = beast([row("leader", 1, 5), row("second", 2, 2)]);

    expect(status.state).toBe("unranked");
    expect(status.rankedAthleteCount).toBe(2);
    expect(status.athlete).toBeNull();
    expect(status.gapCopy).toBe("Complete an eligible workout to enter today's standings.");
    expect(status.sharePayload).toBeNull();
  });

  it("marks finalized standings and produces a finalized athlete-owned payload", () => {
    const status = beast([row("me", 1, 8.4, true)], "weekly", "finalized");

    expect(status.periodState).toBe("finalized");
    expect(status.rankDisplay).toBe("Finished #1");
    expect(status.positionCopy).toBe("You finished #1 among 1 ranked athlete.");
    expect(status.timingCopy).toEqual({ primary: "Final standings.", secondary: null });
    expect(status.sharePayload).toMatchObject({
      competition: "beast",
      cadence: "weekly",
      rank: 1,
      score: 8.4,
      periodState: "finalized",
      finalized: true,
      tiedAtRank: false,
    });
  });

  it("uses finalized tied wording without changing the authoritative rank", () => {
    const status = beast([
      row("winner", 1, 9),
      row("me", 2, 7.5, true),
      row("co-finisher", 2, 7.5),
      row("fourth", 4, 5),
    ], "weekly", "finalized");

    expect(status.athlete).toMatchObject({ rank: 2, tiedAtRank: true });
    expect(status.rankDisplay).toBe("Finished tied for #2");
    expect(status.positionCopy).toBe("You finished tied for #2 among 4 ranked athletes.");
    expect(status.sharePayload?.tiedAtRank).toBe(true);
  });

  it("returns a safe query-error state without accepting a raw backend message", () => {
    const status = buildPersonalCompetitionStatus("beast", "daily", { state: "error" });

    expect(status.state).toBe("error");
    expect(status.positionCopy).toBe("PHATBOT couldn't load these standings. Your workout data is safe. Try again.");
    expect(status.rankedAthleteCount).toBeNull();
  });

  it("keeps loading separate from error and data states", () => {
    const pair = buildBeastStatusPair({
      daily: { state: "loading" },
      weekly: { state: "success", period: period("weekly"), rows: [row("me", 1, 4.2, true)] },
    });

    expect(pair.today.state).toBe("loading");
    expect(pair.today.heading).toBe("TODAY");
    expect(pair.thisWeek.state).toBe("ranked");
    expect(pair.thisWeek.heading).toBe("THIS WEEK");
  });

  it("exposes exact lifecycle timestamps and formats them in Eastern time", () => {
    const status = beast([row("me", 1, 4.2, true)]);

    expect(status.timing).toEqual({
      timeZone: "America/New_York",
      periodStart: "2026-09-11T04:00:00Z",
      periodEnd: "2026-09-12T04:00:00Z",
      reconcileAt: "2026-09-12T16:00:00Z",
      closesAtLabel: "September 12, 2026 at 12:00 AM EDT",
      reconciliationEndsAtLabel: "September 12, 2026 at 12:00 PM EDT",
    });
    expect(status.timingCopy).toEqual({
      primary: "Live until September 12, 2026 at 12:00 AM EDT.",
      secondary: "Results may reconcile until September 12, 2026 at 12:00 PM EDT before finalization.",
    });
  });

  it("uses fixed precision when identifying ties and calculating the exact gap", () => {
    const status = beast([
      row("next", 1, 0.1234574),
      row("me", 2, 0.12345649, true),
      row("tie", 2, 0.1234564),
    ]);

    expect(status.athlete).toMatchObject({ score: 0.123456, tiedAtRank: true });
    expect(status.nextHigherScoreGroup).toEqual({ rank: 1, score: 0.123457, athleteCount: 1 });
    expect(status.exactGap).toBe(0.000001);
  });

  it("selects surrounding rank groups when the athlete is outside the top ten", () => {
    const rows = Array.from({ length: 13 }, (_, index) => row(
      index === 11 ? "me" : `athlete-${index + 1}`,
      index + 1,
      13 - index,
      index === 11,
    ));

    expect(selectAroundYouRows(rows).map(item => [item.rank, item.athlete_user_id])).toEqual([
      [11, "athlete-11"],
      [12, "me"],
      [13, "athlete-13"],
    ]);
  });

  it("keeps complete tie groups and competition ranks in surrounding positions", () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, index) => row(`top-${index + 1}`, index + 1, 20 - index)),
      row("rank-ten", 10, 10),
      row("tie-a", 11, 9),
      row("me", 11, 9, true),
      row("tie-c", 11, 9),
      row("next-group", 14, 8),
    ];

    expect(selectAroundYouRows(rows).map(item => [item.rank, item.athlete_user_id])).toEqual([
      [10, "rank-ten"],
      [11, "tie-a"],
      [11, "me"],
      [11, "tie-c"],
      [14, "next-group"],
    ]);
  });

  it("does not create an Around You section when the athlete is already visible", () => {
    expect(selectAroundYouRows([row("leader", 1, 9), row("me", 2, 8, true)])).toEqual([]);
  });
});
