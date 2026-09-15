import { DaybookApiError } from "@family-daybook/api-client";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { ZodError } from "zod";

export function todayLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function friendlyError(error: unknown) {
  if (error instanceof DaybookApiError) {
    return apiErrorMessages[error.code] ?? error.message;
  }
  if (error instanceof ZodError) {
    return "Family Daybook received unexpected data. Please try again or update the app.";
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function isAccountDeletionInProgress(error: unknown) {
  return error instanceof DaybookApiError && error.code === "ACCOUNT_DELETION_IN_PROGRESS";
}

function dateTimePartsInTimezone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
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

export function localDateTimeIso(date: string, time: string, timeZone?: string) {
  if (!timeZone) return new Date(`${date}T${time}:00`).toISOString();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(`${date}T${time}`);
  if (!match) throw new Error("Enter a valid date and time.");
  const desired = match.slice(1).map(Number);
  const desiredAsUtc = Date.UTC(desired[0], desired[1] - 1, desired[2], desired[3], desired[4], 0);
  let candidate = desiredAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = dateTimePartsInTimezone(new Date(candidate), timeZone);
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
  const rendered = dateTimePartsInTimezone(result, timeZone);
  if (`${rendered.year}-${rendered.month}-${rendered.day}T${rendered.hour}:${rendered.minute}` !== `${date}T${time}`) {
    throw new Error("That local time does not exist in the workspace timezone.");
  }
  return result.toISOString();
}

export function formatLocalDate(value: string, locale?: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateTime(value: string | Date, timeZone: string, locale?: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  };
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);
  }
}

export async function invalidateRecordQueries(queryClient: QueryClient, ...queryKeys: QueryKey[]) {
  await Promise.all([
    ...queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    queryClient.invalidateQueries({ queryKey: ["timeline"] }),
  ]);
}

export function versionAtLeast(current: string, minimum: string) {
  const parts = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parts(current);
  const right = parts(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) > (right[index] ?? 0)) return true;
    if ((left[index] ?? 0) < (right[index] ?? 0)) return false;
  }
  return true;
}

const apiErrorMessages: Partial<Record<DaybookApiError["code"], string>> = {
  API_AUTH_UNAVAILABLE: "Mobile sign-in is temporarily unavailable. Please try again later.",
  MOBILE_API_DISABLED: "The Family Daybook mobile app is not currently available. Please use Family Daybook on the web.",
  MOBILE_API_MAINTENANCE: "Family Daybook is temporarily unavailable for maintenance. Please try again soon.",
  MONGODB_REQUIRED: "Family Daybook storage is temporarily unavailable. Please try again later.",
  ACCOUNT_DELETION_IN_PROGRESS: "Your previous account deletion must finish before Family Daybook can continue.",
};

export const mobileMaintenanceMessage =
  "Family Daybook is temporarily unavailable for maintenance. Please try again soon.";

export const mobileUpdateRequiredMessage =
  "This version of Family Daybook is no longer supported. Update the app to continue.";
