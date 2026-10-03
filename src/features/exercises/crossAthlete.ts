export type ComparableSet = {
  weight: number;
  reps: number;
  set_type: string;
  load_type?: "external_load" | "bodyweight" | "assisted_bodyweight" | null;
};

export type AthleteExerciseExposure = {
  athleteId: string;
  athleteName: string;
  unit: "lb" | "kg";
  canonicalExerciseId: string;
  canonicalExerciseName: string;
  completedAt: string;
  sets: ComparableSet[];
};

export type CrossAthleteExerciseSummary = {
  athleteId: string;
  athleteName: string;
  unit: "lb" | "kg";
  exposures: number;
  first: { weight: number; reps: number; strengthSignal: number; completedAt: string } | null;
  latest: { weight: number; reps: number; strengthSignal: number; completedAt: string } | null;
  best: { weight: number; reps: number; strengthSignal: number; completedAt: string } | null;
  improvementPercent: number | null;
};

const ELIGIBLE_SET_TYPES = new Set(["working", "top", "backoff"]);

export function estimatedStrength(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

export function bestComparableSet(sets: ComparableSet[]) {
  const eligible = sets
    .filter((set) =>
      ELIGIBLE_SET_TYPES.has(set.set_type)
      && set.load_type !== "assisted_bodyweight"
      && Number.isFinite(Number(set.weight))
      && Number(set.weight) >= 0
      && set.reps > 0,
    )
    .map((set) => ({ ...set, weight: Number(set.weight) }));

  if (!eligible.length) return null;

  return eligible.sort((a, b) => {
    const signalDiff = estimatedStrength(b.weight, b.reps) - estimatedStrength(a.weight, a.reps);
    if (signalDiff !== 0) return signalDiff;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return b.reps - a.reps;
  })[0];
}

export function summarizeCrossAthleteExercise(
  exposures: AthleteExerciseExposure[],
  canonicalExerciseId: string,
): CrossAthleteExerciseSummary[] {
  const byAthlete = new Map<string, AthleteExerciseExposure[]>();

  for (const exposure of exposures) {
    if (exposure.canonicalExerciseId !== canonicalExerciseId) continue;
    if (!bestComparableSet(exposure.sets)) continue;
    const rows = byAthlete.get(exposure.athleteId) ?? [];
    rows.push(exposure);
    byAthlete.set(exposure.athleteId, rows);
  }

  return [...byAthlete.entries()].map(([athleteId, athleteExposures]) => {
    const ordered = [...athleteExposures].sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
    );
    const performances = ordered.map((exposure) => {
      const best = bestComparableSet(exposure.sets)!;
      return {
        weight: best.weight,
        reps: best.reps,
        strengthSignal: estimatedStrength(best.weight, best.reps),
        completedAt: exposure.completedAt,
      };
    });
    const first = performances[0] ?? null;
    const latest = performances.at(-1) ?? null;
    const best = performances.length
      ? [...performances].sort((a, b) => b.strengthSignal - a.strengthSignal)[0]
      : null;
    const improvementPercent =
      first && latest && first.strengthSignal > 0
        ? ((latest.strengthSignal - first.strengthSignal) / first.strengthSignal) * 100
        : null;

    return {
      athleteId,
      athleteName: ordered[0]?.athleteName ?? "Athlete",
      unit: ordered[0]?.unit ?? "lb",
      exposures: performances.length,
      first,
      latest,
      best,
      improvementPercent,
    };
  }).sort((a, b) => a.athleteName.localeCompare(b.athleteName));
}
