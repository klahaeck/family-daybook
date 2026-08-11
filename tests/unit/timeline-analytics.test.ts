import { describe, expect, it } from "vitest";

import type { TimelineData, TimelineItem } from "@/lib/domain/types";
import { toTimelineItems } from "@/lib/repository/helpers";
import {
  getCareRecordItems,
  summarizeCareRecords,
} from "@/lib/timeline-analytics";

const workspace: TimelineData["workspace"] = {
  id: "workspace",
  name: "Family",
  timezone: "America/Chicago",
  ownerId: "owner",
  hardDeleteEnabled: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  demo: false,
};

function careItem(
  id: string,
  input: Partial<TimelineItem> = {},
): TimelineItem {
  return {
    id,
    kind: "care",
    occurredAt: "2026-08-04T15:00:00.000Z",
    recordedAt: "2026-08-04T15:30:00.000Z",
    title: "Breakfast",
    childIds: ["child-a"],
    caregiverIds: ["caregiver-a"],
    status: "completed",
    currentRevisionId: `revision-${id}`,
    ...input,
  };
}

const data: TimelineData = {
  workspace,
  children: [
    {
      id: "child-a",
      workspaceId: workspace.id,
      displayName: "Avery",
      birthdate: "2018-01-01",
      color: "sage",
      active: true,
      sortOrder: 1,
    },
    {
      id: "child-b",
      workspaceId: workspace.id,
      displayName: "Blair",
      birthdate: "2020-01-01",
      color: "blue",
      active: true,
      sortOrder: 2,
    },
  ],
  caregivers: [
    {
      id: "caregiver-a",
      workspaceId: workspace.id,
      displayName: "Parent A",
      relationship: "Parent",
      isOwner: true,
      active: true,
    },
    {
      id: "caregiver-b",
      workspaceId: workspace.id,
      displayName: "Parent B",
      relationship: "Parent",
      isOwner: false,
      active: true,
    },
  ],
  items: [
    careItem("breakfast", {
      childIds: ["child-a", "child-b"],
      caregiverIds: ["caregiver-a", "caregiver-b"],
    }),
    careItem("story", {
      title: "Bedtime story",
      caregiverIds: ["caregiver-b"],
    }),
    careItem("partial", {
      title: "Bedtime story",
      caregiverIds: ["caregiver-b"],
      status: "partial",
    }),
    careItem("missed", {
      title: "School pickup",
      caregiverIds: [],
      status: "missed",
    }),
    careItem("not-applicable", {
      title: "Pack school lunch",
      caregiverIds: [],
      status: "not_applicable",
    }),
  ],
  attachments: [],
  revisions: [],
};

describe("timeline care-record analytics", () => {
  it("removes legacy caregiver attribution from non-occurrence projections", () => {
    const [item] = toTimelineItems({
      entries: [
        {
          id: "legacy-missed",
          workspaceId: workspace.id,
          dailyLogId: "log-1",
          taskKey: "school_dropoff",
          taskLabel: "School drop-off",
          childIds: ["child-a"],
          caregiverIds: ["caregiver-a"],
          status: "missed",
          occurredAt: "2026-08-04T15:00:00.000Z",
          recordedAt: "2026-08-04T15:30:00.000Z",
          currentRevisionId: "revision-legacy-missed",
          createdBy: "owner",
          lateEntry: false,
        },
      ],
      appointments: [],
      incidents: [],
      arrangements: [],
      dailyLogs: [],
      timezone: workspace.timezone,
    });

    expect(item).toMatchObject({
      id: "legacy-missed",
      status: "missed",
      caregiverIds: [],
    });
  });

  it("offers only care record items that can represent time", () => {
    expect(getCareRecordItems(data.items)).toEqual([
      "Bedtime story",
      "Breakfast",
    ]);
  });

  it("counts a shared-child record once and attributes it to each caregiver", () => {
    const summary = summarizeCareRecords(data, {
      recordItems: ["Breakfast", "Bedtime story"],
      childIds: ["child-a", "child-b"],
      caregiverIds: ["caregiver-a", "caregiver-b"],
      from: "2026-08-04",
      to: "2026-08-04",
    });

    expect(summary.recordCount).toBe(3);
    expect(summary.representedCaregiverCount).toBe(2);
    expect(summary.representedRecordItemCount).toBe(2);
    expect(summary.caregivers.map((caregiver) => caregiver.totalRecords)).toEqual([
      1,
      3,
    ]);
    expect(summary.recordItems).toEqual([
      { label: "Bedtime story", count: 2 },
      { label: "Breakfast", count: 1 },
    ]);
    expect(summary.records.map((record) => record.id)).toEqual([
      "breakfast",
      "story",
      "partial",
    ]);
  });

  it("applies record-item, child, caregiver, and workspace-date filters", () => {
    const summary = summarizeCareRecords(data, {
      recordItems: ["Bedtime story"],
      childIds: ["child-a"],
      caregiverIds: ["caregiver-a"],
      from: "2026-08-04",
      to: "2026-08-04",
    });

    expect(summary.recordCount).toBe(0);
    expect(summary.representedCaregiverCount).toBe(0);
    expect(summary.representedRecordItemCount).toBe(0);
  });
});
