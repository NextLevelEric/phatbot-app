export type PhatbotSetType = "warmup" | "working" | "top" | "backoff" | "drop" | "timed" | "tempo";

export const PHATBOT_SET_TYPE_LABELS: Record<PhatbotSetType, string> = {
  warmup: "Warmup",
  working: "Working",
  top: "Top Set",
  backoff: "Backoff",
  drop: "Drop Set",
  timed: "Timed",
  tempo: "Tempo",
};

export function isPoScoredSetType(type: string) {
  return type === "working" || type === "top" || type === "backoff";
}

export function isVolumeSetType(type: string) {
  return type !== "warmup" && type !== "timed";
}

export function isPrEligibleSetType(type: string) {
  return type === "working" || type === "top" || type === "backoff";
}

export function isTechniqueProtectedSetType(type: string) {
  return type === "tempo";
}
