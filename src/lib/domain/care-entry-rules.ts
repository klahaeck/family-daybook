import type { CareStatus } from "./types";

export interface CareEntryRuleInput {
  status: CareStatus;
  caregiverIds: string[];
  durationMinutes?: number;
  activityType?: string;
}

export function careStatusRecordsProvidedCare(status: CareStatus): boolean {
  return status === "completed" || status === "partial";
}

export function careStatusTimeLabel(status: CareStatus): string {
  if (status === "missed") return "Expected";
  if (status === "not_applicable") return "Routine time";
  return "Occurred";
}

export function assertValidCareEntryDetails(input: CareEntryRuleInput): void {
  const recordsProvidedCare = careStatusRecordsProvidedCare(input.status);
  if (
    (recordsProvidedCare && input.caregiverIds.length === 0) ||
    (!recordsProvidedCare && input.caregiverIds.length > 0)
  ) {
    throw new Error("INVALID_CAREGIVER_ATTRIBUTION");
  }
  if (
    !recordsProvidedCare &&
    (input.durationMinutes !== undefined || input.activityType !== undefined)
  ) {
    throw new Error("INVALID_NON_OCCURRENCE_DETAILS");
  }
}
