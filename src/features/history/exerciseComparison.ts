export type HistoricalExercisePerformance<TSet = unknown> = {
  workoutSessionId: string;
  completedAt: string;
  notes?: string | null;
  sets: TSet[];
};

export function hasPerformedSets<TSet>(performance: HistoricalExercisePerformance<TSet> | null | undefined) {
  return Boolean(performance && performance.sets.length > 0);
}

export function mostRecentPerformedExercise<TSet>(
  performances: HistoricalExercisePerformance<TSet>[],
): HistoricalExercisePerformance<TSet> | null {
  return (
    performances
      .filter(hasPerformedSets)
      .sort(
        (a, b) =>
          new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
      )[0] ?? null
  );
}

export function reportExerciseStatus(args: {
  currentComparableSetCount: number;
  historicalPerformance: HistoricalExercisePerformance | null;
}) {
  if (args.currentComparableSetCount === 0) {
    return {
      label: "NOT SCORED" as const,
      isScored: false,
      explanation: args.historicalPerformance
        ? "Skipped today. Your previous performance is preserved as a training reference."
        : "Skipped today. No previous performed history was found.",
    };
  }

  if (!args.historicalPerformance) {
    return {
      label: "BASELINE" as const,
      isScored: false,
      explanation: "First recorded performance. PHATBOT is establishing your baseline.",
    };
  }

  return {
    label: "SCORED" as const,
    isScored: true,
    explanation: "Compared with the last time you actually performed this exercise.",
  };
}

export function formatHistoricalPerformanceDate(completedAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(completedAt));
}
