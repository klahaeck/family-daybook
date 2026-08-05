import { describe, expect, it } from "vitest";

import type { TimelineData, TimelineItem } from "@/lib/domain/types";
import {
  getCareRecordItems,
  summarizeCareTime,
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
    durationMinutes: 30,
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
      durationMinutes: 45,
    }),
    careItem("untimed", {
      title: "Bedtime story",
      caregiverIds: ["caregiver-b"],
      durationMinutes: undefined,
      status: "partial",
    }),
    careItem("missed", {
      title: "School pickup",
      status: "missed",
      durationMinutes: 20,
    }),
  ],
  attachments: [],
  revisions: [],
};

describe("timeline care-time analytics", () => {
  it("offers only care record items that can represent time", () => {
    expect(getCareRecordItems(data.items)).toEqual([
      "Bedtime story",
      "Breakfast",
    ]);
  });

  it("counts a shared-child record once and attributes it to each caregiver", () => {
    const summary = summarizeCareTime(data, {
      recordItems: ["Breakfast", "Bedtime story"],
      childIds: ["child-a", "child-b"],
      caregiverIds: ["caregiver-a", "caregiver-b"],
      from: "2026-08-04",
      to: "2026-08-04",
    });

    expect(summary.recordedMinutes).toBe(75);
    expect(summary.timedRecords).toBe(2);
    expect(summary.untimedRecords).toBe(1);
    expect(summary.caregivers.map((caregiver) => caregiver.totalMinutes)).toEqual([
      30,
      75,
    ]);
    expect(summary.recordItems).toEqual([
      { label: "Bedtime story", minutes: 45 },
      { label: "Breakfast", minutes: 30 },
    ]);
  });

  it("applies record-item, child, caregiver, and workspace-date filters", () => {
    const summary = summarizeCareTime(data, {
      recordItems: ["Bedtime story"],
      childIds: ["child-a"],
      caregiverIds: ["caregiver-a"],
      from: "2026-08-04",
      to: "2026-08-04",
    });

    expect(summary.recordedMinutes).toBe(0);
    expect(summary.timedRecords).toBe(0);
    expect(summary.untimedRecords).toBe(0);
  });
});
