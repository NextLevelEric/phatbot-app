export type ScoredSetType = "warmup" | "working" | "top" | "backoff";

export type PerformanceSet = {
  weight: number;
  reps: number;
  partialReps: number;
  setType: ScoredSetType;
};

export type ExercisePerformance = {
  sets: PerformanceSet[];
  notes?: string | null;
};

export type ExerciseScoreResult = {
  result: "progression" | "neutral" | "regression" | "baseline";
  score: 0 | 0.5 | 1;
  explanationCode: string;
  currentBest: PerformanceSet | null;
  previousBest: PerformanceSet | null;
};

const MIN_REPS_FOR_WEIGHT_INCREASE_WIN = 3;

const progressionNoteTerms = [
  "better form", "improved form", "improved my form", "improving form", "improve my form", "improve form", "cleaner form",
  "better technique", "improved technique", "improved my technique", "improve my technique", "improve technique", "better control",
  "improved control", "more control", "controlled reps", "slower eccentric", "slowed down",
  "slower reps", "slower tempo", "time under tension", "better tempo", "improved tempo",
  "better range of motion", "improved range of motion", "fuller range of motion", "better rom",
  "improved rom", "better mind muscle connection", "better mind-muscle connection",
];

const resetNoteTerms = ["deload", "technique reset", "form reset", "safer technique", "rebuild", "recovery week"];

function includesAny(notes: string | null | undefined, terms: string[]) {
  const normalized = notes?.toLowerCase() ?? "";
  return terms.some((term) => normalized.includes(term));
}

function comparableSets(performance: ExercisePerformance) {
  return performance.sets.filter((set) => set.setType !== "warmup" && set.reps > 0);
}

function bestSet(performance: ExercisePerformance): PerformanceSet | null {
  const sets = comparableSets(performance);
  if (sets.length === 0) return null;
  return [...sets].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (b.reps !== a.reps) return b.reps - a.reps;
    return b.partialReps - a.partialReps;
  })[0];
}

export function scoreExercisePerformance(current: ExercisePerformance, previous: ExercisePerformance | null): ExerciseScoreResult {
  const currentBest = bestSet(current);
  const previousBest = previous ? bestSet(previous) : null;

  // An exercise with no scored work set is treated as unscored, not as a failure.
  // Callers already exclude baseline rows from workout averages, so skipped exercises
  // cannot drag down the athlete's score.
  if (!currentBest) {
    return { result: "baseline", score: 0.5, explanationCode: "no_scored_work_set", currentBest, previousBest };
  }

  if (!previous || !previousBest) {
    return { result: "baseline", score: 0.5, explanationCode: "first_comparable_performance", currentBest, previousBest };
  }

  const notes = current.notes ?? "";
  const qualityImproved = includesAny(notes, progressionNoteTerms);
  const plannedReset = includesAny(notes, resetNoteTerms);

  if (currentBest.weight > previousBest.weight) {
    if (currentBest.reps >= MIN_REPS_FOR_WEIGHT_INCREASE_WIN) {
      return {
        result: "progression", score: 1,
        explanationCode: currentBest.reps >= previousBest.reps ? "higher_weight_equal_or_more_reps" : "higher_weight_three_plus_reps",
        currentBest, previousBest,
      };
    }
    return { result: "neutral", score: 0.5, explanationCode: qualityImproved ? "higher_weight_quality_focus" : "higher_weight_under_three_reps", currentBest, previousBest };
  }

  if (currentBest.weight === previousBest.weight) {
    if (currentBest.reps > previousBest.reps) return { result: "progression", score: 1, explanationCode: "same_weight_more_reps", currentBest, previousBest };
    if (currentBest.reps === previousBest.reps) {
      if (currentBest.partialReps > previousBest.partialReps) return { result: "progression", score: 1, explanationCode: "same_weight_reps_more_partials", currentBest, previousBest };
      if (qualityImproved) return { result: "progression", score: 1, explanationCode: "same_numbers_improved_quality", currentBest, previousBest };
      return { result: "neutral", score: 0.5, explanationCode: "matched_previous_performance", currentBest, previousBest };
    }
    if (qualityImproved) return { result: "neutral", score: 0.5, explanationCode: "fewer_reps_improved_quality", currentBest, previousBest };
    if (plannedReset) return { result: "neutral", score: 0.5, explanationCode: "fewer_reps_planned_reset", currentBest, previousBest };
    return { result: "regression", score: 0, explanationCode: "same_weight_fewer_reps", currentBest, previousBest };
  }

  if (qualityImproved) return { result: "neutral", score: 0.5, explanationCode: "lower_weight_improved_quality", currentBest, previousBest };
  if (plannedReset) return { result: "neutral", score: 0.5, explanationCode: "lower_weight_planned_reset", currentBest, previousBest };
  return { result: "regression", score: 0, explanationCode: "lower_weight", currentBest, previousBest };
}

export function explainExerciseScore(code: string) {
  const explanations: Record<string, string> = {
    first_comparable_performance: "Baseline established. Complete this exercise again to create a true comparison.",
    higher_weight_equal_or_more_reps: "Progression: you used more weight and matched or exceeded your previous reps.",
    higher_weight_three_plus_reps: "Progression: you moved more weight for at least 3 full reps, so PHATBOT counts the load increase as a win.",
    higher_weight_under_three_reps: "Neutral: you moved more weight, but fewer than 3 full reps does not yet count as a progression win.",
    higher_weight_quality_focus: "Neutral by design: you tested a heavier load while prioritizing execution quality. PHATBOT will not punish intentional technique work.",
    same_weight_more_reps: "Progression: you completed more full reps at the same weight.",
    same_weight_reps_more_partials: "Progression: full reps matched and you added lengthened partials.",
    same_numbers_improved_quality: "Progression: the numbers matched and your notes show better execution. Cleaner reps are real progress. Beep boop.",
    matched_previous_performance: "Neutral: you matched your previous best performance.",
    fewer_reps_improved_quality: "Neutral by design: reps were lower, but your notes show improved form, control, tempo, or range of motion. Good training decision. PHATBOT protects quality work from a negative score.",
    fewer_reps_planned_reset: "Neutral: reps were lower, but your notes indicate a planned technique or recovery reset.",
    same_weight_fewer_reps: "Regression: the same weight was completed for fewer reps.",
    lower_weight_improved_quality: "Neutral by design: you reduced the load to improve execution quality. That is not failure. Better form, control, tempo, or range of motion is productive training. Beep boop.",
    lower_weight_planned_reset: "Neutral: load was lower, but your notes indicate a planned technique or recovery reset.",
    lower_weight: "Regression: the strongest comparable set used less weight than last time.",
    no_scored_work_set: "Skipped / unscored: no comparable working set was logged, so PHATBOT excluded this exercise from the workout score.",
  };
  return explanations[code] ?? "PHATBOT compared this exercise with your most recent comparable performance.";
}