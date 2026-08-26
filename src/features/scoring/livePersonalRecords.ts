import { detectPersonalRecords, type PRSet } from "@/features/scoring/personalRecords";

export type LivePRBadge = {
  classification: "true_pr" | "weight_milestone";
  label: string;
  detail: string;
};

export function classifyLivePersonalRecord(currentSet: PRSet, historicalSets: PRSet[]): LivePRBadge | null {
  const records = detectPersonalRecords([currentSet], historicalSets);
  const truePR = records.find((record) => record.classification === "true_pr");
  if (truePR) {
    return {
      classification: "true_pr",
      label: "🏆 TRUE PR",
      detail: `New heaviest weight: ${truePR.weight}`,
    };
  }

  const milestone = records.find((record) => record.classification === "weight_milestone");
  if (milestone) {
    return {
      classification: "weight_milestone",
      label: "📈 BEST AT THIS WEIGHT",
      detail: `Best reps at ${milestone.weight}: ${milestone.reps}`,
    };
  }

  return null;
}
