import { localDateInTimezone } from "@/lib/domain/dates";
import type { TimelineData, TimelineItem } from "@/lib/domain/types";

const timeBearingStatuses = new Set(["completed", "partial"]);

export interface CareTimeFilters {
  recordItems: string[];
  childIds: string[];
  caregiverIds: string[];
  from: string;
  to: string;
}

export interface CareTimeSummary {
  recordedMinutes: number;
  timedRecords: number;
  untimedRecords: number;
  caregivers: Array<{
    id: string;
    label: string;
    totalMinutes: number;
    recordItems: Array<{ label: string; minutes: number }>;
  }>;
  recordItems: Array<{ label: string; minutes: number }>;
}

function overlaps(values: string[], selected: Set<string>): boolean {
  return values.some((value) => selected.has(value));
}

export function getCareRecordItems(items: TimelineItem[]): string[] {
  return [
    ...new Set(
      items
        .filter(
          (item) =>
            item.kind === "care" && timeBearingStatuses.has(item.status),
        )
        .map((item) => item.title),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function summarizeCareTime(
  data: TimelineData,
  filters: CareTimeFilters,
): CareTimeSummary {
  const selectedRecordItems = new Set(filters.recordItems);
  const selectedChildren = new Set(filters.childIds);
  const selectedCaregivers = new Set(filters.caregiverIds);

  const records = data.items.filter((item) => {
    if (
      item.kind !== "care" ||
      !timeBearingStatuses.has(item.status) ||
      !selectedRecordItems.has(item.title) ||
      !overlaps(item.childIds, selectedChildren) ||
      !overlaps(item.caregiverIds, selectedCaregivers)
    ) {
      return false;
    }
    const localDate = localDateInTimezone(
      new Date(item.occurredAt),
      data.workspace.timezone,
    );
    return (!filters.from || localDate >= filters.from) &&
      (!filters.to || localDate <= filters.to);
  });
  const timedRecords = records.filter(
    (item) =>
      typeof item.durationMinutes === "number" && item.durationMinutes > 0,
  );

  const recordItems = filters.recordItems
    .map((label) => ({
      label,
      minutes: timedRecords
        .filter((item) => item.title === label)
        .reduce((total, item) => total + (item.durationMinutes ?? 0), 0),
    }))
    .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));

  return {
    recordedMinutes: timedRecords.reduce(
      (total, item) => total + (item.durationMinutes ?? 0),
      0,
    ),
    timedRecords: timedRecords.length,
    untimedRecords: records.length - timedRecords.length,
    caregivers: data.caregivers
      .filter((caregiver) => selectedCaregivers.has(caregiver.id))
      .map((caregiver) => {
        const caregiverRecords = timedRecords.filter((item) =>
          item.caregiverIds.includes(caregiver.id),
        );
        const caregiverRecordItems = filters.recordItems.map((label) => ({
          label,
          minutes: caregiverRecords
            .filter((item) => item.title === label)
            .reduce((total, item) => total + (item.durationMinutes ?? 0), 0),
        }));
        return {
          id: caregiver.id,
          label: caregiver.displayName,
          totalMinutes: caregiverRecordItems.reduce(
            (total, item) => total + item.minutes,
            0,
          ),
          recordItems: caregiverRecordItems,
        };
      }),
    recordItems,
  };
}
