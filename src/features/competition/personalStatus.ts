export const COMPETITION_TIME_ZONE = "America/New_York";
export const COMPETITION_SCORE_PRECISION = 6;

export type CompetitionKind = "beast" | "eager_beaver" | "cardio_bunny" | "step_king";
export type CompetitionCadence = "daily" | "weekly";
export type CompetitionPeriodState = "open" | "reconciling" | "finalized";
export type CompetitionStatusState = "loading" | "error" | "unavailable" | "empty" | "unranked" | "ranked";

export type CompetitionPeriodRecord = {
  id: string;
  competition: CompetitionKind;
  cadence: CompetitionCadence;
  period_start: string;
  period_end: string;
  reconcile_at: string | null;
  status: CompetitionPeriodState;
};

export type CompetitionLeaderboardRow = {
  rank: number | null;
  athlete_user_id: string;
  display_name: string;
  score: number;
  result_label: string | null;
  is_me: boolean;
};

export type CompetitionTiming = {
  timeZone: typeof COMPETITION_TIME_ZONE;
  periodStart: string;
  periodEnd: string;
  reconcileAt: string | null;
  closesAtLabel: string;
  reconciliationEndsAtLabel: string | null;
};

export type AthleteCompetitionStanding = {
  rank: number;
  score: number;
  resultLabel: string;
  tiedAtRank: boolean;
};

export type NextHigherScoreGroup = {
  rank: number;
  score: number;
  athleteCount: number;
};

export type AthleteOwnedStandingPayload = {
  competition: CompetitionKind;
  cadence: CompetitionCadence;
  rank: number;
  score: number;
  resultLabel: string;
  periodState: CompetitionPeriodState;
  finalized: boolean;
  tiedAtRank: boolean;
};

export type PersonalCompetitionStatus = {
  state: CompetitionStatusState;
  competition: CompetitionKind;
  cadence: CompetitionCadence;
  heading: "TODAY" | "THIS WEEK";
  periodState: CompetitionPeriodState | null;
  rankedAthleteCount: number | null;
  rankDisplay: string;
  athlete: AthleteCompetitionStanding | null;
  nextHigherScoreGroup: NextHigherScoreGroup | null;
  exactGap: number | null;
  gapUnit: "percentage_points" | "eager_score_points" | "steps";
  positionCopy: string;
  gapCopy: string | null;
  timing: CompetitionTiming | null;
  timingCopy: {
    primary: string | null;
    secondary: string | null;
  };
  sharePayload: AthleteOwnedStandingPayload | null;
};

export type CompetitionStatusQuery =
  | { state: "loading" }
  | { state: "error" }
  | { state: "success"; period: CompetitionPeriodRecord | null; rows: readonly CompetitionLeaderboardRow[] };

export type BeastStatusPair = { today: PersonalCompetitionStatus; thisWeek: PersonalCompetitionStatus };

const competitionNames: Record<CompetitionKind, string> = {
  beast: "Beast",
  eager_beaver: "Eager Beaver",
  cardio_bunny: "Cardio Bunny",
  step_king: "Step King",
};

function heading(cadence: CompetitionCadence) {
  return cadence === "daily" ? "TODAY" as const : "THIS WEEK" as const;
}

function periodPhrase(cadence: CompetitionCadence) {
  return cadence === "daily" ? "today's" : "this week's";
}

function fixedScore(score: number) {
  if (!Number.isFinite(score)) throw new RangeError("Competition scores must be finite numbers.");
  const fixed = score.toFixed(COMPETITION_SCORE_PRECISION);
  const scaled = Number(fixed.replace(".", ""));
  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError("Competition score is outside the supported fixed-precision range.");
  }
  return scaled;
}

function fromFixedScore(score: number) {
  return score / 10 ** COMPETITION_SCORE_PRECISION;
}

function formatNumber(value: number, maximumFractionDigits = COMPETITION_SCORE_PRECISION) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function resultLabel(competition: CompetitionKind, row: CompetitionLeaderboardRow) {
  if (row.result_label?.trim()) return row.result_label.trim();
  if (competition === "step_king") return `${formatNumber(row.score, 0)} steps`;
  if (competition === "eager_beaver") return `${formatNumber(row.score)} Eager score`;
  return `${row.score >= 0 ? "+" : ""}${formatNumber(row.score)}%`;
}

function ordinal(rank: number) {
  const tens = rank % 100;
  if (tens >= 11 && tens <= 13) return `${rank}th`;
  if (rank % 10 === 1) return `${rank}st`;
  if (rank % 10 === 2) return `${rank}nd`;
  if (rank % 10 === 3) return `${rank}rd`;
  return `${rank}th`;
}

function gapUnit(competition: CompetitionKind): PersonalCompetitionStatus["gapUnit"] {
  if (competition === "step_king") return "steps";
  if (competition === "eager_beaver") return "eager_score_points";
  return "percentage_points";
}

function buildGapCopy(competition: CompetitionKind, exactGap: number) {
  const formatted = formatNumber(exactGap);
  if (competition === "step_king") {
    return `You need more than ${formatted} additional ${exactGap === 1 ? "step" : "steps"} to move ahead at the current standings.`;
  }
  if (competition === "eager_beaver") {
    return `You're ${formatted} Eager score ${exactGap === 1 ? "point" : "points"} behind the next score.`;
  }
  return `You're ${formatted} percentage ${exactGap === 1 ? "point" : "points"} behind the next score.`;
}

function exactEasternLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COMPETITION_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function buildTiming(period: CompetitionPeriodRecord): CompetitionTiming {
  return {
    timeZone: COMPETITION_TIME_ZONE,
    periodStart: period.period_start,
    periodEnd: period.period_end,
    reconcileAt: period.reconcile_at,
    closesAtLabel: exactEasternLabel(period.period_end),
    reconciliationEndsAtLabel: period.reconcile_at ? exactEasternLabel(period.reconcile_at) : null,
  };
}

function buildTimingCopy(period: CompetitionPeriodRecord, values: CompetitionTiming): PersonalCompetitionStatus["timingCopy"] {
  if (period.status === "finalized") return { primary: "Final standings.", secondary: null };
  if (period.status === "reconciling") {
    return {
      primary: "Competition closed.",
      secondary: values.reconciliationEndsAtLabel
        ? `Results may reconcile until ${values.reconciliationEndsAtLabel}.`
        : "Results are reconciling before finalization.",
    };
  }
  return {
    primary: `Live until ${values.closesAtLabel}.`,
    secondary: values.reconciliationEndsAtLabel
      ? `Results may reconcile until ${values.reconciliationEndsAtLabel} before finalization.`
      : "Results finalize shortly after close.",
  };
}

function baseStatus(
  competition: CompetitionKind,
  cadence: CompetitionCadence,
  state: CompetitionStatusState,
  positionCopy: string,
): PersonalCompetitionStatus {
  const rankDisplay: Record<Exclude<CompetitionStatusState, "ranked">, string> = {
    loading: "—",
    error: "Unavailable",
    unavailable: "Not open",
    empty: "Open board",
    unranked: "Unranked",
  };
  return {
    state,
    competition,
    cadence,
    heading: heading(cadence),
    periodState: null,
    rankedAthleteCount: null,
    rankDisplay: state === "ranked" ? "—" : rankDisplay[state],
    athlete: null,
    nextHigherScoreGroup: null,
    exactGap: null,
    gapUnit: gapUnit(competition),
    positionCopy,
    gapCopy: null,
    timing: null,
    timingCopy: { primary: null, secondary: null },
    sharePayload: null,
  };
}

export function buildPersonalCompetitionStatus(
  competition: CompetitionKind,
  cadence: CompetitionCadence,
  query: CompetitionStatusQuery,
): PersonalCompetitionStatus {
  const name = competitionNames[competition];
  if (query.state === "loading") {
    return baseStatus(competition, cadence, "loading", `Loading ${periodPhrase(cadence)} ${name} standings.`);
  }
  if (query.state === "error") {
    return baseStatus(competition, cadence, "error", "PHATBOT couldn't load these standings. Your workout data is safe. Try again.");
  }
  if (!query.period) {
    return baseStatus(competition, cadence, "unavailable", `No ${name} competition period is available right now.`);
  }

  const period = query.period;
  if (period.competition !== competition || period.cadence !== cadence) {
    return baseStatus(competition, cadence, "error", "PHATBOT couldn't read these standings. Your workout data is safe. Try again.");
  }
  const periodTiming = buildTiming(period);
  const common = {
    periodState: period.status,
    timing: periodTiming,
    timingCopy: buildTimingCopy(period, periodTiming),
  };

  try {
    const rankedRows = query.rows.filter(row => row.rank !== null);
    for (const row of rankedRows) fixedScore(row.score);
    const meRows = rankedRows.filter(row => row.is_me);
    if (meRows.length > 1) throw new RangeError("More than one current-athlete row was returned.");

    if (rankedRows.length === 0) {
      return {
        ...baseStatus(competition, cadence, "empty", `No athletes have an eligible ${name} result ${cadence === "daily" ? "today" : "this week"} yet.`),
        ...common,
        rankedAthleteCount: 0,
        gapCopy: `Complete an eligible workout to enter ${periodPhrase(cadence)} standings.`,
      };
    }

    const me = meRows[0];
    if (!me || me.rank === null) {
      return {
        ...baseStatus(competition, cadence, "unranked", `You aren't ranked in ${periodPhrase(cadence)} ${name} standings yet.`),
        ...common,
        rankedAthleteCount: rankedRows.length,
        gapCopy: `Complete an eligible workout to enter ${periodPhrase(cadence)} standings.`,
      };
    }

    const myFixedScore = fixedScore(me.score);
    const myScoreGroup = rankedRows.filter(row => fixedScore(row.score) === myFixedScore);
    const higherRows = rankedRows.filter(row => fixedScore(row.score) > myFixedScore);
    const nextFixedScore = higherRows.length ? Math.min(...higherRows.map(row => fixedScore(row.score))) : null;
    const nextRows = nextFixedScore === null ? [] : higherRows.filter(row => fixedScore(row.score) === nextFixedScore);
    const nextHigherScoreGroup = nextRows.length
      ? {
          rank: Math.min(...nextRows.map(row => row.rank as number)),
          score: fromFixedScore(nextFixedScore as number),
          athleteCount: nextRows.length,
        }
      : null;
    const exactGap = nextFixedScore === null ? null : fromFixedScore(nextFixedScore - myFixedScore);
    const tiedAtRank = myScoreGroup.length > 1;
    const finalized = period.status === "finalized";
    const positionCopy = finalized
      ? tiedAtRank
        ? `You finished tied for #${me.rank} among ${rankedRows.length} ranked athletes.`
        : `You finished #${me.rank} among ${rankedRows.length} ranked ${rankedRows.length === 1 ? "athlete" : "athletes"}.`
      : tiedAtRank
        ? `You're tied for ${ordinal(me.rank)} of ${rankedRows.length} ranked athletes.`
        : `You're ${ordinal(me.rank)} of ${rankedRows.length} ranked ${rankedRows.length === 1 ? "athlete" : "athletes"}.`;
    const topCopy = me.rank === 1
      ? finalized
        ? tiedAtRank ? "You shared the top score." : "You finished with the top score."
        : tiedAtRank ? "You share the top score." : "You currently hold the top score."
      : null;
    const athlete = {
      rank: me.rank,
      score: fromFixedScore(myFixedScore),
      resultLabel: resultLabel(competition, me),
      tiedAtRank,
    };

    return {
      state: "ranked",
      competition,
      cadence,
      heading: heading(cadence),
      ...common,
      rankedAthleteCount: rankedRows.length,
      rankDisplay: finalized
        ? tiedAtRank ? `Finished tied for #${me.rank}` : `Finished #${me.rank}`
        : `#${me.rank}`,
      athlete,
      nextHigherScoreGroup,
      exactGap,
      gapUnit: gapUnit(competition),
      positionCopy,
      gapCopy: exactGap === null ? topCopy : buildGapCopy(competition, exactGap),
      sharePayload: {
        competition,
        cadence,
        rank: athlete.rank,
        score: athlete.score,
        resultLabel: athlete.resultLabel,
        periodState: period.status,
        finalized: period.status === "finalized",
        tiedAtRank: athlete.tiedAtRank,
      },
    };
  } catch {
    return {
      ...baseStatus(competition, cadence, "error", "PHATBOT couldn't read these standings. Your workout data is safe. Try again."),
      ...common,
    };
  }
}

export function selectAroundYouRows(
  rows: readonly CompetitionLeaderboardRow[],
  visibleRowCount = 10,
): CompetitionLeaderboardRow[] {
  const rankedRows = rows.filter((row): row is CompetitionLeaderboardRow & { rank: number } => row.rank !== null);
  if (rankedRows.slice(0, visibleRowCount).some(row => row.is_me)) return [];

  const groups: Array<{ rank: number; rows: Array<CompetitionLeaderboardRow & { rank: number }> }> = [];
  for (const row of rankedRows) {
    const current = groups.at(-1);
    if (current?.rank === row.rank) current.rows.push(row);
    else groups.push({ rank: row.rank, rows: [row] });
  }

  const athleteGroupIndex = groups.findIndex(group => group.rows.some(row => row.is_me));
  if (athleteGroupIndex < 0) return [];
  return groups
    .slice(Math.max(0, athleteGroupIndex - 1), athleteGroupIndex + 2)
    .flatMap(group => group.rows);
}

export function buildBeastStatusPair(input: {
  daily: CompetitionStatusQuery;
  weekly: CompetitionStatusQuery;
}): BeastStatusPair {
  return {
    today: buildPersonalCompetitionStatus("beast", "daily", input.daily),
    thisWeek: buildPersonalCompetitionStatus("beast", "weekly", input.weekly),
  };
}
