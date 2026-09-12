import type { CompetitionKind } from "./personalStatus";

export type AwardArt = {
  src: string;
  alt: string;
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

export function getCompetitionAwardArt(competition: CompetitionKind): AwardArt {
  return competitionAwardArt[competition];
}

export function selectLatestEarnedAward<T extends { competition: CompetitionKind }>(
  awards: readonly T[],
  competition: CompetitionKind,
): T | null {
  return awards.find(award => award.competition === competition) ?? null;
}
