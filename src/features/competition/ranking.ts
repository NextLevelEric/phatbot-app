export const COMPETITION_SCORE_PRECISION = 6;

export type RankableCompetitionEntry = {
  athleteId: string;
  score: number;
  displayOrderKey?: string;
};

export type RankedCompetitionEntry<T extends RankableCompetitionEntry> = T & {
  fixedPrecisionScore: number;
  rank: number;
  isChampion: boolean;
  isCoChampion: boolean;
};

function fixedPrecisionScore(score: number) {
  if (!Number.isFinite(score)) throw new RangeError("Competition scores must be finite numbers.");

  const fixed = score.toFixed(COMPETITION_SCORE_PRECISION);
  const scaled = Number(fixed.replace(".", ""));
  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError("Competition score is outside the supported fixed-precision range.");
  }
  return scaled;
}

function stableTextCompare(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function rankCompetitionEntries<T extends RankableCompetitionEntry>(
  entries: readonly T[],
): RankedCompetitionEntry<T>[] {
  const athleteIds = new Set<string>();
  const normalized = entries.map((entry, originalIndex) => {
    if (!entry.athleteId) throw new RangeError("Competition entries require an athlete ID.");
    if (athleteIds.has(entry.athleteId)) throw new RangeError(`Duplicate competition athlete: ${entry.athleteId}`);
    athleteIds.add(entry.athleteId);
    return {
      entry,
      originalIndex,
      fixedPrecisionScore: fixedPrecisionScore(entry.score),
    };
  });

  normalized.sort((left, right) => {
    if (left.fixedPrecisionScore !== right.fixedPrecisionScore) {
      return right.fixedPrecisionScore - left.fixedPrecisionScore;
    }
    const displayKeyComparison = stableTextCompare(
      left.entry.displayOrderKey ?? left.entry.athleteId,
      right.entry.displayOrderKey ?? right.entry.athleteId,
    );
    if (displayKeyComparison !== 0) return displayKeyComparison;
    const athleteComparison = stableTextCompare(left.entry.athleteId, right.entry.athleteId);
    return athleteComparison !== 0 ? athleteComparison : left.originalIndex - right.originalIndex;
  });

  let previousScore: number | null = null;
  let currentRank = 0;
  const ranked = normalized.map((item, index) => {
    if (previousScore === null || item.fixedPrecisionScore !== previousScore) currentRank = index + 1;
    previousScore = item.fixedPrecisionScore;
    return {
      ...item.entry,
      fixedPrecisionScore: item.fixedPrecisionScore,
      rank: currentRank,
      isChampion: currentRank === 1,
      isCoChampion: false,
    };
  });

  const championCount = ranked.filter((entry) => entry.rank === 1).length;
  if (championCount > 1) {
    for (const entry of ranked) entry.isCoChampion = entry.rank === 1;
  }

  return ranked;
}
