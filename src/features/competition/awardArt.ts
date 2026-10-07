import type { CompetitionCadence, CompetitionKind, CompetitionPeriodRecord } from "./personalStatus";

export type AwardArt = {
  src: string;
  alt: string;
  title?: string;
};

export const competitionAwardArt: Readonly<Record<CompetitionKind, AwardArt>> = {
  beast: {
    src: "/competition-awards/beast-medallion.png",
    alt: "Beast of the Day gold medallion",
  },
  eager_beaver: {
    src: "/competition-awards/eager-beaver-golden-log.png",
    alt: "Eager Beaver Golden Log trophy",
  },
  cardio_bunny: {
    src: "/competition-awards/cardio-bunny-golden-carrot.png",
    alt: "Cardio Bunny Golden Carrot trophy",
  },
  step_king: {
    src: "/competition-awards/step-king-crown.png",
    alt: "Step King gold crown",
  },
};

export const weeklyCompetitionAwardArt: Readonly<Record<CompetitionKind, AwardArt>> = {
  beast: { title: "Beast of the Week", src: "/competition-awards/beast-of-the-week-platinum.png", alt: "Beast of the Week platinum medallion" },
  eager_beaver: { title: "Eager Beaver of the Week", src: "/competition-awards/eager-beaver-of-the-week-platinum.png", alt: "Eager Beaver of the Week platinum trophy" },
  cardio_bunny: { title: "Cardio Bunny of the Week", src: "/competition-awards/cardio-bunny-of-the-week-platinum.png", alt: "Cardio Bunny of the Week platinum trophy" },
  step_king: { title: "Step King of the Week", src: "/competition-awards/step-king-of-the-week-platinum.png", alt: "Step King of the Week platinum crown" },
};

export function getCompetitionAwardArt(competition: CompetitionKind, cadence: CompetitionCadence = "daily"): AwardArt {
  return (cadence === "weekly" ? weeklyCompetitionAwardArt : competitionAwardArt)[competition];
}

// Award details and report snapshots already carry these authoritative period fields.
export function getAwardArt(award: Pick<CompetitionPeriodRecord, "competition" | "cadence">): AwardArt {
  return getCompetitionAwardArt(award.competition, award.cadence);
}

export function selectLatestEarnedAward<T extends { competition: CompetitionKind }>(
  awards: readonly T[],
  competition: CompetitionKind,
): T | null {
  return awards.find(award => award.competition === competition) ?? null;
}
