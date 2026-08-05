import { localDateInTimezone } from "@/lib/domain/dates";
import type { TimelineData, TimelineItem } from "@/lib/domain/types";

const includedCareStatuses = new Set(["completed", "partial"]);

export interface CareRecordFilters {
  recordItems: string[];
  childIds: string[];
  caregiverIds: string[];
  from: string;
  to: string;
}

export interface CareRecordSummary {
  recordCount: number;
  representedCaregiverCount: number;
  representedRecordItemCount: number;
  caregivers: Array<{
    id: string;
    label: string;
    totalRecords: number;
    recordItems: Array<{ label: string; count: number }>;
  }>;
  recordItems: Array<{ label: string; count: number }>;
  records: TimelineItem[];
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
            item.kind === "care" && includedCareStatuses.has(item.status),
        )
        .map((item) => item.title),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function summarizeCareRecords(
  data: TimelineData,
  filters: CareRecordFilters,
): CareRecordSummary {
  const selectedRecordItems = new Set(filters.recordItems);
  const selectedChildren = new Set(filters.childIds);
  const selectedCaregivers = new Set(filters.caregiverIds);

  const records = data.items.filter((item) => {
    if (
      item.kind !== "care" ||
      !includedCareStatuses.has(item.status) ||
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
  const recordItems = filters.recordItems
    .map((label) => ({
      label,
      count: records.filter((item) => item.title === label).length,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const caregivers = data.caregivers
    .filter((caregiver) => selectedCaregivers.has(caregiver.id))
    .map((caregiver) => {
      const caregiverRecords = records.filter((item) =>
        item.caregiverIds.includes(caregiver.id),
      );
      const caregiverRecordItems = filters.recordItems.map((label) => ({
        label,
        count: caregiverRecords.filter((item) => item.title === label).length,
      }));
      return {
        id: caregiver.id,
        label: caregiver.displayName,
        totalRecords: caregiverRecords.length,
        recordItems: caregiverRecordItems,
      };
    });

  return {
    recordCount: records.length,
    representedCaregiverCount: caregivers.filter(
      (caregiver) => caregiver.totalRecords > 0,
    ).length,
    representedRecordItemCount: recordItems.filter((item) => item.count > 0)
      .length,
    caregivers,
    recordItems,
    records,
  };
}
