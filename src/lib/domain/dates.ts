import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

export const LATE_ENTRY_GRACE_DAYS = 2;

export function localDateInTimezone(
  date = new Date(),
  timezone = "America/Chicago",
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isValidLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return isValid(date) && date.toISOString().slice(0, 10) === value;
}

export function shiftLocalDate(value: string, days: number): string {
  if (!isValidLocalDate(value)) throw new Error("INVALID_LOCAL_DATE");
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export function weekdayForLocalDate(value: string): number {
  if (!isValidLocalDate(value)) throw new Error("INVALID_LOCAL_DATE");
  return new Date(`${value}T12:00:00.000Z`).getUTCDay();
}

export function ageOnDate(birthdate: string, onDate: string): number | null {
  if (!isValidLocalDate(birthdate) || !isValidLocalDate(onDate) || birthdate > onDate) {
    return null;
  }
  const [birthYear, birthMonth, birthDay] = birthdate.split("-").map(Number);
  const [year, month, day] = onDate.split("-").map(Number);
  const birthdayHasPassed = month > birthMonth || (month === birthMonth && day >= birthDay);
  return year - birthYear - (birthdayHasPassed ? 0 : 1);
}

export function formatDateTime(value: string, timezone: string): string {
  const date = parseISO(value);
  if (!isValid(date)) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatTime(value: string, timezone: string): string {
  const date = parseISO(value);
  if (!isValid(date)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDay(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? format(date, "EEEE, MMMM d") : value;
}

export function relativeTime(value: string): string {
  const date = parseISO(value);
  return isValid(date)
    ? formatDistanceToNowStrict(date, { addSuffix: true })
    : "unknown";
}

export function toDateTimeLocal(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function dateTimePartsInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function toDateTimeLocalInTimezone(date: Date, timezone: string): string {
  const parts = dateTimePartsInTimezone(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function localDateTimeToUtc(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error("INVALID_LOCAL_DATE_TIME");
  const desired = match.slice(1).map((part) => Number(part ?? 0));
  const desiredAsUtc = Date.UTC(
    desired[0],
    desired[1] - 1,
    desired[2],
    desired[3],
    desired[4],
    desired[5],
  );
  let candidate = desiredAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = dateTimePartsInTimezone(new Date(candidate), timezone);
    const actualAsUtc = Date.UTC(
      Number(actual.year),
      Number(actual.month) - 1,
      Number(actual.day),
      Number(actual.hour),
      Number(actual.minute),
      Number(actual.second),
    );
    const difference = desiredAsUtc - actualAsUtc;
    if (difference === 0) break;
    candidate += difference;
  }
  const result = new Date(candidate);
  const rendered = toDateTimeLocalInTimezone(result, timezone);
  if (rendered !== value.slice(0, 16)) throw new Error("INVALID_LOCAL_DATE_TIME");
  return result.toISOString();
}

export function lateEntryFor(
  occurredAt: string,
  recordedAt: string,
  timezone: string,
): boolean {
  const occurredDate = localDateInTimezone(new Date(occurredAt), timezone);
  const recordedDate = localDateInTimezone(new Date(recordedAt), timezone);
  return shiftLocalDate(occurredDate, LATE_ENTRY_GRACE_DAYS) < recordedDate;
}
