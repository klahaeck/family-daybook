import { DaybookApiError } from "@family-daybook/api-client";

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
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function isAccountDeletionInProgress(error: unknown) {
  return error instanceof DaybookApiError && error.code === "ACCOUNT_DELETION_IN_PROGRESS";
}

export function localDateTimeIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
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
