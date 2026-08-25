import { isPrEligibleSetType } from "@/features/scoring/setTypes";

export type PRSet = {
  weight: number;
  reps: number;
  partialReps?: number;
  setType: string;
};

export type PersonalRecordResult = {
  type: "heaviest_weight" | "matched_load_reps";
  weight: number;
  reps: number;
  previousWeight: number | null;
  previousReps: number | null;
  message: string;
};

function scoredSets(sets: PRSet[]) {
  return sets.filter((set) => isPrEligibleSetType(set.setType) && set.reps > 0);
}

export function detectPersonalRecords(currentSets: PRSet[], historicalSets: PRSet[]): PersonalRecordResult[] {
  const current = scoredSets(currentSets);
  const history = scoredSets(historicalSets);
  if (current.length === 0) return [];

  const records: PersonalRecordResult[] = [];
  const previousMaxWeight = history.length ? Math.max(...history.map((set) => set.weight)) : null;
  const currentMaxWeight = Math.max(...current.map((set) => set.weight));

  if (previousMaxWeight !== null && currentMaxWeight > previousMaxWeight) {
    const bestAtNewWeight = current
      .filter((set) => set.weight === currentMaxWeight)
      .sort((a, b) => b.reps - a.reps)[0];

    records.push({
      type: "heaviest_weight",
      weight: bestAtNewWeight.weight,
      reps: bestAtNewWeight.reps,
      previousWeight: previousMaxWeight,
      previousReps: null,
      message: `New weight PR: ${bestAtNewWeight.weight} × ${bestAtNewWeight.reps}. Previous heaviest load was ${previousMaxWeight}.`,
    });
  }

  const currentByWeight = new Map<number, PRSet>();
  for (const set of current) {
    const existing = currentByWeight.get(set.weight);
    if (!existing || set.reps > existing.reps) currentByWeight.set(set.weight, set);
  }

  for (const [weight, set] of currentByWeight) {
    const previousAtWeight = history.filter((historical) => historical.weight === weight);
    if (previousAtWeight.length === 0) continue;
    const previousBestReps = Math.max(...previousAtWeight.map((historical) => historical.reps));
    if (set.reps > previousBestReps) {
      records.push({
        type: "matched_load_reps",
        weight,
        reps: set.reps,
        previousWeight: weight,
        previousReps: previousBestReps,
        message: `Rep PR at ${weight}: ${set.reps} reps, up from ${previousBestReps}.`,
      });
    }
  }

  return records;
}
