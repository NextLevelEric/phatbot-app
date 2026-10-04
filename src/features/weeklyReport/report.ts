export const WEEKLY_REPORT_CALCULATION_VERSION = "weekly-report-v1";

export type ProgressiveOverloadStatus = "available" | "incomplete" | "baseline_only" | "not_applicable";

export type WeeklyReportPayload = {
  schema_version: 1;
  time_zone: "America/New_York";
  period: { start: string; end: string };
  summary: { headline: string; detail: string };
  workouts: { completed: number; training_days: number };
  progressive_overload: {
    status: ProgressiveOverloadStatus;
    required_exercise_scores: number;
    persisted_exercise_scores: number;
    required_workout_scores: number;
    persisted_workout_scores: number;
    wins: number | null;
    neutral: number | null;
    regressions: number | null;
    average_score_percent: number | null;
  };
  training_volume: { value: number; previous_value: number; change_percent: number | null; unit: "lb" | "kg" };
  exercise_wins: Array<{
    canonical_exercise_id: string;
    name: string;
    explanation_code: string | null;
    current: { weight: number; reps: number; partial_reps: number } | null;
    previous: { weight: number; reps: number; partial_reps: number } | null;
  }>;
  cardio: {
    sessions: number;
    distance_meters: number;
    comparable_improvements: Array<{ label: string; current_seconds: number; previous_seconds: number; improvement_seconds: number }>;
  };
  steps: { status: "available" | "unavailable"; total: number | null; recorded_days: number };
  bodyweight: null | { unit: "lb" | "kg"; first: number; latest: number; change: number };
  sleep?: { status: "available" | "partial" | "unavailable"; recorded_nights: number; average_hours: number | null; previous_average_hours: number | null; change_hours: number | null };
  nutrition?: { recorded_days: number; average_energy_kcal: number | null; average_protein_g: number | null; energy_cv_percent: number | null; consistency: "baseline" | "very_consistent" | "consistent" | "variable" };
  hardware: Array<{
    award_id: string;
    competition: "beast" | "eager_beaver" | "cardio_bunny" | "step_king";
    cadence: "daily" | "weekly";
    award_key: string;
    rank: number;
    period_start: string;
    period_end: string;
    finalized_at: string;
  }>;
  next_targets: Array<{ kind: "exercise" | "cardio"; label: string; target: string }>;
};

export type WeeklyProgressReport = {
  id: string;
  athlete_user_id: string;
  period_start: string;
  period_end: string;
  finalized_at: string;
  calculation_version: string;
  report_payload: WeeklyReportPayload;
};

export function poAvailabilityCopy(status: ProgressiveOverloadStatus) {
  if (status === "incomplete") return "Progress scoring is unavailable because some authoritative workout scores are still missing.";
  if (status === "baseline_only") return "This week established new exercise baselines. Comparable progress begins next time.";
  if (status === "not_applicable") return "No eligible completed workouts were recorded this week.";
  return null;
}

export function signedValue(value: number, digits = 1) {
  const rounded = value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

export function formatWeight(value: number, unit: "lb" | "kg") {
  return `${Number(value).toFixed(1)} ${unit}`;
}

export function formatDistance(meters: number) {
  const miles = meters / 1609.344;
  return miles >= 0.1 ? `${miles.toFixed(1)} mi` : `${Math.round(meters)} m`;
}

export function weeklyAnswer(payload: WeeklyReportPayload) {
  const wins: string[] = [];
  const concerns: string[] = [];
  const actions: string[] = [];
  if (payload.progressive_overload.status === "available" && (payload.progressive_overload.wins ?? 0) > 0) wins.push(`${payload.progressive_overload.wins} strength progression win${payload.progressive_overload.wins === 1 ? "" : "s"} recorded.`);
  if (payload.cardio.comparable_improvements.length > 0) wins.push(`${payload.cardio.comparable_improvements.length} cardio benchmark${payload.cardio.comparable_improvements.length === 1 ? "" : "s"} improved.`);
  if (payload.progressive_overload.status === "incomplete") concerns.push("Strength progression scoring is incomplete, so PHATBOT will not guess at your result.");
  if (payload.sleep?.status === "partial") concerns.push(`Sleep context is partial (${payload.sleep.recorded_nights} nights recorded).`);
  if (payload.sleep?.status === "unavailable") concerns.push("Sleep context is unavailable for this week.");
  if (payload.bodyweight) concerns.push(`Body weight moved ${signedValue(payload.bodyweight.change)} ${payload.bodyweight.unit} across recorded measurements. Weight change is context, not a score.`);
  if (payload.nutrition) {
    if (payload.nutrition.recorded_days < 4) concerns.push(`Nutrition baseline is still building (${payload.nutrition.recorded_days} days recorded).`);
    else if (payload.nutrition.consistency === "very_consistent" || payload.nutrition.consistency === "consistent") wins.push(`Nutrition was ${payload.nutrition.consistency === "very_consistent" ? "very consistent" : "consistent"} across ${payload.nutrition.recorded_days} recorded days.`);
    else concerns.push("Nutrition was more variable this week. PHATBOT treats that as context—not a failed day or a reason to restrict harder.");
  }
  if (payload.next_targets[0]) actions.push(`${payload.next_targets[0].label}: ${payload.next_targets[0].target}`);
  else if (payload.workouts.completed === 0) actions.push("Complete your next training session to establish a fresh comparison.");
  else actions.push("Repeat comparable training next week so PHATBOT can measure the trend.");
  return { wins, concerns, actions };
}
