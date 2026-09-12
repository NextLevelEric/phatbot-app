import type { CompetitionCadence, CompetitionKind, CompetitionPeriodState } from "./personalStatus";

export type LeaderboardIdentityMode = "private" | "profile" | "custom";
export type CompetitionShareMode = "standing" | "award" | "leader";

export type CompetitionShareContent = {
  heading: string;
  hero: string;
  result: string;
  athleteName: string;
  status: string;
  note: string;
  fileName: string;
  shareText: string;
};

const competitionNames: Record<CompetitionKind, string> = {
  beast: "BEAST",
  eager_beaver: "EAGER BEAVER",
  cardio_bunny: "CARDIO BUNNY",
  step_king: "STEP KING",
};

const hardwareNames: Record<CompetitionKind, string> = {
  beast: "BEAST MEDALLION",
  eager_beaver: "GOLDEN LOG",
  cardio_bunny: "GOLDEN CARROT",
  step_king: "GOLDEN CROWN",
};

function safeIdentity(value: string | null | undefined) {
  return value?.trim() || "PHATBOT Athlete";
}

export function resolveLeaderboardIdentity(input: {
  mode: LeaderboardIdentityMode | null | undefined;
  profileName: string | null | undefined;
  customName: string | null | undefined;
}) {
  if (input.mode === "profile") return safeIdentity(input.profileName);
  if (input.mode === "custom") return safeIdentity(input.customName);
  return "PHATBOT Athlete";
}

export function canShareAthleteCompetition(input: { isMine: boolean; rank: number | null | undefined }) {
  return input.isMine && Number.isInteger(input.rank) && (input.rank as number) > 0;
}

export function buildCompetitionShareContent(input: {
  competition: CompetitionKind;
  cadence: CompetitionCadence;
  athleteName: string;
  result: string;
  rank: number;
  finalized: boolean;
  periodState?: CompetitionPeriodState;
  tiedAtRank?: boolean;
  mode?: CompetitionShareMode;
  coWinner?: boolean | null;
}): CompetitionShareContent {
  const mode = input.mode ?? "standing";
  const period = input.cadence === "daily" ? "TODAY" : "THIS WEEK";
  const awardPeriod = input.cadence === "daily" ? "DAY" : "WEEK";
  const athleteName = safeIdentity(input.athleteName);
  const heading = `${competitionNames[input.competition]} · ${period}`;

  let hero: string;
  let status: string;
  let note: string;
  if (mode === "award") {
    if (input.competition === "beast") {
      hero = input.coWinner === true ? `CO-BEAST OF THE ${awardPeriod}` : input.coWinner === false ? `BEAST OF THE ${awardPeriod}` : "BEAST CHAMPION";
    } else {
      hero = input.coWinner === true ? "CO-CHAMPION" : hardwareNames[input.competition];
    }
    status = input.coWinner === true ? "SHARED FIRST · HARDWARE EARNED" : "CHAMPION · HARDWARE EARNED";
    note = "Final result";
  } else if (mode === "leader") {
    hero = input.finalized ? hardwareNames[input.competition] : `#${input.rank}`;
    status = input.finalized ? "OFFICIAL WINNER" : "LEADING RIGHT NOW";
    note = input.finalized ? "Final result" : "Subject to change until close";
  } else if (input.finalized) {
    hero = input.tiedAtRank ? `FINISHED TIED FOR #${input.rank}` : `FINISHED #${input.rank}`;
    status = "FINAL PLACEMENT";
    note = "Official result";
  } else if (input.periodState === "reconciling") {
    hero = `#${input.rank}`;
    status = "PENDING FINALIZATION";
    note = "Subject to change until finalized";
  } else {
    hero = `#${input.rank}`;
    status = "LIVE STANDING";
    note = "Subject to change until close";
  }

  const fileName = `phatbot-${input.competition}-${input.cadence}-${mode}.png`;
  return {
    heading,
    hero,
    result: input.result,
    athleteName,
    status,
    note,
    fileName,
    shareText: mode === "award"
      ? `${athleteName} · ${hero} · ${input.result}`
      : `My ${competitionNames[input.competition]} ${input.finalized ? "result" : "standing"}: ${hero} · ${input.result}`,
  };
}
