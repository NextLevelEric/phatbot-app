export type PlateauCoachingInput = {
  exerciseName: string;
  consecutiveFlatSessions: number;
  previousWeight?: number | null;
  previousReps?: number | null;
  weightUnit: "lb" | "kg";
};

export type PlateauRecommendation = {
  exerciseName: string;
  headline: string;
  body: string;
  action: string;
  adjustmentType: "rebuild";
  suggestedWeight: number | null;
  protectedAdjustment: true;
};

function roundTrainingLoad(value: number, unit: "lb" | "kg") {
  const increment = unit === "kg" ? 2.5 : 5;
  return Math.max(increment, Math.round(value / increment) * increment);
}

export function buildPlateauRecommendation(input: PlateauCoachingInput): PlateauRecommendation {
  const { exerciseName, consecutiveFlatSessions, previousWeight, previousReps, weightUnit } = input;
  const suggestedWeight = previousWeight && previousWeight > 0
    ? roundTrainingLoad(previousWeight * 0.9, weightUnit)
    : null;

  const loadText = suggestedWeight
    ? `Try about ${suggestedWeight} ${weightUnit} today`
    : "Use a slightly easier load today";
  const repText = previousReps && previousReps > 0
    ? ` and aim for ${previousReps} clean, controlled reps before adding load again.`
    : ", prioritize clean controlled reps, and rebuild from there.";

  return {
    exerciseName,
    headline: `${exerciseName} has been flat for ${consecutiveFlatSessions} sessions.`,
    body: "No robot panic. Repeating the same performance is useful information, but this is a good time to create a small reset instead of forcing another identical attempt.",
    action: `${loadText}${repText}`,
    adjustmentType: "rebuild",
    suggestedWeight,
    protectedAdjustment: true,
  };
}
