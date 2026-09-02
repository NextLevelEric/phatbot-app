export const COMPETITION_TIME_ZONE = "America/New_York";

export const COMPETITION_CATEGORIES = [
  "beast",
  "eager_beaver",
  "cardio_bunny",
  "step_king",
] as const;

export const COMPETITION_CADENCES = ["daily", "weekly"] as const;

export type CompetitionCategory = (typeof COMPETITION_CATEGORIES)[number];
export type CompetitionCadence = (typeof COMPETITION_CADENCES)[number];

export type CompetitionPeriod = {
  cadence: CompetitionCadence;
  timeZone: typeof COMPETITION_TIME_ZONE;
  startsAt: Date;
  endsAt: Date;
  reconciliationEndsAt: Date;
};

type LocalDate = {
  year: number;
  month: number;
  day: number;
};

type LocalDateTime = LocalDate & {
  hour: number;
  minute: number;
  second: number;
};

const localPartsFormatter = new Intl.DateTimeFormat("en-US-u-ca-gregory", {
  timeZone: COMPETITION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function supportedCadencesForCategory(_category: CompetitionCategory): readonly CompetitionCadence[] {
  return COMPETITION_CADENCES;
}

function requireValidInstant(instant: Date) {
  if (Number.isNaN(instant.getTime())) throw new RangeError("Competition period requires a valid instant.");
}

function localDateForInstant(instant: Date): LocalDate {
  requireValidInstant(instant);
  const parts = new Map(
    localPartsFormatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.get("year")!,
    month: parts.get("month")!,
    day: parts.get("day")!,
  };
}

function assertValidLocalDate(date: LocalDate) {
  const candidate = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (
    candidate.getUTCFullYear() !== date.year
    || candidate.getUTCMonth() !== date.month - 1
    || candidate.getUTCDate() !== date.day
  ) {
    throw new RangeError("Competition period requires a valid local calendar date.");
  }
}

function addLocalDays(date: LocalDate, days: number): LocalDate {
  assertValidLocalDate(date);
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function localDayOfWeek(date: LocalDate) {
  assertValidLocalDate(date);
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function zonedDateTimeToInstant(local: LocalDateTime): Date {
  assertValidLocalDate(local);
  const targetCivilTime = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  let candidateTime = targetCivilTime;

  // Resolve an IANA-zoned civil time without assuming a fixed UTC offset.
  // Midnight and noon always exist in America/New_York, including DST days.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = new Date(candidateTime);
    const parts = new Map(
      localPartsFormatter
        .formatToParts(candidate)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const representedCivilTime = Date.UTC(
      parts.get("year")!,
      parts.get("month")! - 1,
      parts.get("day")!,
      parts.get("hour")!,
      parts.get("minute")!,
      parts.get("second")!,
    );
    const correction = targetCivilTime - representedCivilTime;
    candidateTime += correction;
    if (correction === 0) return new Date(candidateTime);
  }

  throw new RangeError("Could not resolve the competition boundary in America/New_York.");
}

function instantAt(date: LocalDate, hour: number) {
  return zonedDateTimeToInstant({ ...date, hour, minute: 0, second: 0 });
}

export function competitionPeriodForInstant(cadence: CompetitionCadence, instant: Date): CompetitionPeriod {
  const localDate = localDateForInstant(instant);

  if (cadence === "daily") {
    const nextDate = addLocalDays(localDate, 1);
    return {
      cadence,
      timeZone: COMPETITION_TIME_ZONE,
      startsAt: instantAt(localDate, 0),
      endsAt: instantAt(nextDate, 0),
      reconciliationEndsAt: instantAt(nextDate, 12),
    };
  }

  const weekStartDate = addLocalDays(localDate, -localDayOfWeek(localDate));
  const nextWeekDate = addLocalDays(weekStartDate, 7);
  return {
    cadence,
    timeZone: COMPETITION_TIME_ZONE,
    startsAt: instantAt(weekStartDate, 0),
    endsAt: instantAt(nextWeekDate, 0),
    reconciliationEndsAt: instantAt(nextWeekDate, 12),
  };
}

export function isInstantInCompetitionPeriod(instant: Date, period: CompetitionPeriod) {
  requireValidInstant(instant);
  const time = instant.getTime();
  return time >= period.startsAt.getTime() && time < period.endsAt.getTime();
}
