export type StrengthSet = {
  weight: number;
  reps: number;
  setType: string;
};

export type StrengthExercise = {
  exerciseId: string;
  sets: StrengthSet[];
};

export type StrengthChangeResult = {
  currentLiftTotal: number;
  previousLiftTotal: number;
  percentageChange: number | null;
  comparableExerciseCount: number;
};

function exerciseLiftTotal(sets: StrengthSet[]) {
  return sets
    .filter((set) => set.setType !== "warmup" && set.reps > 0 && set.weight >= 0)
    .reduce((sum, set) => sum + (set.weight * set.reps), 0);
}

export function calculateStrengthChange(
  currentExercises: StrengthExercise[],
  previousExercises: StrengthExercise[],
): StrengthChangeResult {
  const previousByExercise = new Map(previousExercises.map((exercise) => [exercise.exerciseId, exercise]));

  let currentLiftTotal = 0;
  let previousLiftTotal = 0;
  let comparableExerciseCount = 0;

  for (const current of currentExercises) {
    const previous = previousByExercise.get(current.exerciseId);
    if (!previous) continue;

    const currentTotal = exerciseLiftTotal(current.sets);
    const previousTotal = exerciseLiftTotal(previous.sets);

    // A previously performed exercise that is present in today's workout but
    // receives no working volume is meaningful workload information. Keep it
    // in the comparison as zero current volume instead of dropping it and
    // making an incomplete workout look artificially unchanged or N/A.
    if (previousTotal <= 0) continue;

    currentLiftTotal += Math.max(currentTotal, 0);
    previousLiftTotal += previousTotal;
    comparableExerciseCount += 1;
  }

  const percentageChange = previousLiftTotal > 0
    ? ((currentLiftTotal - previousLiftTotal) / previousLiftTotal) * 100
    : null;

  return {
    currentLiftTotal,
    previousLiftTotal,
    percentageChange,
    comparableExerciseCount,
  };
}
