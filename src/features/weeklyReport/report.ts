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
