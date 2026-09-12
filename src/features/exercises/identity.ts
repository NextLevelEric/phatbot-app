export type ExerciseIdentityRelation = {
  id?: string;
  name?: string | null;
  canonical_exercise_id?: string | null;
  canonical_name?: string | null;
  is_standard?: boolean;
  is_custom?: boolean;
  primary_muscle_group?: string | null;
  movement_pattern?: string | null;
  equipment_category?: string | null;
  exercise_class?: string | null;
  laterality?: string | null;
  setup?: string | null;
};

export type ExerciseIdentityRow = {
  exercise_id: string;
  exercise_name_snapshot?: string;
  exercise?: ExerciseIdentityRelation | ExerciseIdentityRelation[] | null;
};

export type CanonicalExerciseIdentity = {
  recordedExerciseId: string;
  canonicalExerciseId: string;
  recordedName: string;
  canonicalName: string;
};

function relation(row: ExerciseIdentityRow) {
  if (Array.isArray(row.exercise)) return row.exercise[0] ?? null;
  return row.exercise ?? null;
}

export function canonicalExerciseId(row: ExerciseIdentityRow) {
  const exercise = relation(row);
  return exercise?.canonical_exercise_id ?? exercise?.id ?? row.exercise_id;
}

export function canonicalExerciseName(row: ExerciseIdentityRow) {
  return relation(row)?.canonical_name?.trim() || relation(row)?.name?.trim() || row.exercise_name_snapshot?.trim() || "Exercise";
}

export function canonicalExerciseIdentity(row: ExerciseIdentityRow): CanonicalExerciseIdentity {
  return {
    recordedExerciseId: row.exercise_id,
    canonicalExerciseId: canonicalExerciseId(row),
    recordedName: row.exercise_name_snapshot?.trim() || relation(row)?.name?.trim() || "Exercise",
    canonicalName: canonicalExerciseName(row),
  };
}

export function sameCanonicalExercise(a: ExerciseIdentityRow, b: ExerciseIdentityRow) {
  return canonicalExerciseId(a) === canonicalExerciseId(b);
}

export function groupByCanonicalExercise<T extends ExerciseIdentityRow>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = canonicalExerciseId(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

export function selectableExercise(exercise: ExerciseIdentityRelation & { id: string }) {
  if (exercise.is_standard) return true;
  return (exercise.canonical_exercise_id ?? exercise.id) === exercise.id;
}

export function rawExerciseIdsForCanonical(
  exercises: (ExerciseIdentityRelation & { id: string })[],
  canonicalIds: Iterable<string>,
) {
  const wanted = new Set(canonicalIds);
  return exercises
    .filter((exercise) => wanted.has(exercise.canonical_exercise_id ?? exercise.id))
    .map((exercise) => exercise.id);
}
