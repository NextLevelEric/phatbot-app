export const WEEKLY_REPORT_TIME_ZONE = "America/New_York";
export const WEEKLY_REPORT_FINALIZATION_HOUR = 12;
export const WEEKLY_REPORT_FINALIZATION_MINUTE = 30;

type LocalDate = { year: number; month: number; day: number };
type LocalDateTime = LocalDate & { hour: number; minute: number; second: number };

export type WeeklyReportPeriod = {
  timeZone: typeof WEEKLY_REPORT_TIME_ZONE;
  startsAt: Date;
  endsAt: Date;
  readyAt: Date;
};

const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory", {
  timeZone: WEEKLY_REPORT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function assertInstant(value: Date) {
  if (Number.isNaN(value.getTime())) throw new RangeError("A valid instant is required.");
}

function assertLocalDate(value: LocalDate) {
  const candidate = new Date(Date.UTC(value.year, value.month - 1, value.day));
  if (candidate.getUTCFullYear() !== value.year || candidate.getUTCMonth() !== value.month - 1 || candidate.getUTCDate() !== value.day) {
    throw new RangeError("A valid local calendar date is required.");
  }
}

function localDateForInstant(instant: Date): LocalDate {
  assertInstant(instant);
  const parts = new Map(formatter.formatToParts(instant).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  return { year: parts.get("year")!, month: parts.get("month")!, day: parts.get("day")! };
}

function addDays(value: LocalDate, days: number): LocalDate {
  assertLocalDate(value);
  const result = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return { year: result.getUTCFullYear(), month: result.getUTCMonth() + 1, day: result.getUTCDate() };
}

function dayOfWeek(value: LocalDate) {
  assertLocalDate(value);
  return new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCDay();
}

function toInstant(local: LocalDateTime) {
  assertLocalDate(local);
  const target = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Map(formatter.formatToParts(new Date(candidate)).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
    const represented = Date.UTC(parts.get("year")!, parts.get("month")! - 1, parts.get("day")!, parts.get("hour")!, parts.get("minute")!, parts.get("second")!);
    const correction = target - represented;
    candidate += correction;
    if (correction === 0) return new Date(candidate);
  }
  throw new RangeError("Could not resolve an Eastern weekly-report boundary.");
}

export function weeklyReportPeriodForInstant(instant: Date): WeeklyReportPeriod {
  const localDate = localDateForInstant(instant);
  const startDate = addDays(localDate, -dayOfWeek(localDate));
  const endDate = addDays(startDate, 7);
  return {
    timeZone: WEEKLY_REPORT_TIME_ZONE,
    startsAt: toInstant({ ...startDate, hour: 0, minute: 0, second: 0 }),
    endsAt: toInstant({ ...endDate, hour: 0, minute: 0, second: 0 }),
    readyAt: toInstant({ ...endDate, hour: WEEKLY_REPORT_FINALIZATION_HOUR, minute: WEEKLY_REPORT_FINALIZATION_MINUTE, second: 0 }),
  };
}

export function latestFinalizableWeeklyReportPeriod(instant: Date) {
  const current = weeklyReportPeriodForInstant(instant);
  const previous = weeklyReportPeriodForInstant(new Date(current.startsAt.getTime() - 1));
  if (instant.getTime() >= previous.readyAt.getTime()) return previous;
  return weeklyReportPeriodForInstant(new Date(previous.startsAt.getTime() - 1));
}

export function isExactWeeklyReportStart(value: Date) {
  assertInstant(value);
  return weeklyReportPeriodForInstant(value).startsAt.getTime() === value.getTime();
}
