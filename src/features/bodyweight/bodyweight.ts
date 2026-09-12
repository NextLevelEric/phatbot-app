export type BodyweightUnit = "lb" | "kg";
export type BodyweightSource = "manual" | "apple_health" | "health_connect";

export type BodyweightMeasurement = {
  id: string;
  athlete_user_id: string;
  weight_value: number;
  unit: BodyweightUnit;
  weight_kg: number;
  measured_at: string;
  source: BodyweightSource;
  created_at: string;
};

const limits: Record<BodyweightUnit, { min: number; max: number }> = {
  lb: { min: 40, max: 1000 },
  kg: { min: 18, max: 454 },
};

export type BodyweightValidation =
  | { valid: true; value: number }
  | { valid: false; message: string };

export function validateBodyweightInput(input: string, unit: BodyweightUnit): BodyweightValidation {
  const normalized = input.trim();
  if (!normalized) return { valid: false, message: "Enter your current weight." };
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return { valid: false, message: "Enter a number with no more than two decimal places." };
  }

  const value = Number(normalized);
  const { min, max } = limits[unit];
  if (!Number.isFinite(value) || value < min || value > max) {
    return { valid: false, message: `Enter a weight between ${min} and ${max} ${unit}.` };
  }

  return { valid: true, value };
}

export function bodyweightInputLimits(unit: BodyweightUnit) {
  return limits[unit];
}

export function formatBodyweight(value: number, unit: BodyweightUnit) {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} ${unit}`;
}

export function newestBodyweightMeasurement<T extends Pick<BodyweightMeasurement, "measured_at" | "created_at">>(
  measurements: readonly T[],
): T | null {
  return [...measurements].sort((left, right) => {
    const measuredDifference = new Date(right.measured_at).getTime() - new Date(left.measured_at).getTime();
    if (measuredDifference !== 0) return measuredDifference;
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  })[0] ?? null;
}
