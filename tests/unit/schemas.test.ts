import { describe, expect, it } from "vitest";

import {
  careEntryCorrectionSchema,
  careEntrySchema,
  careEntryUpdateSchema,
  dailyLogNotesSchema,
  incidentSchema,
  reportSchema,
  specialArrangementCorrectionSchema,
  specialArrangementCreateSchema,
  workspaceSettingsSchema,
} from "@/lib/domain/schemas";

describe("domain validation", () => {
  it("allows time together without a duration", () => {
    const result = careEntrySchema.safeParse({
      localDate: "2026-07-14",
      taskKey: "time_together",
      taskLabel: "Time together",
      childIds: ["child_1"],
      caregiverIds: ["caregiver_1"],
      status: "completed",
      occurredAt: "2026-07-14T18:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("requires a reason when correcting a care entry", () => {
    const result = careEntryCorrectionSchema.safeParse({
      recordId: "care_1",
      childIds: ["child_1"],
      caregiverIds: ["caregiver_1"],
      status: "partial",
      occurredAt: "2026-07-14T18:00:00.000Z",
      reason: "no",
    });
    expect(result.success).toBe(false);
  });

  const careEntrySchemas = [
    {
      name: "create",
      schema: careEntrySchema,
      base: {
        localDate: "2026-07-14",
        taskKey: "time_together",
        taskLabel: "Time together",
      },
    },
    {
      name: "update",
      schema: careEntryUpdateSchema,
      base: { recordId: "care_1" },
    },
    {
      name: "correction",
      schema: careEntryCorrectionSchema,
      base: { recordId: "care_1", reason: "Corrected the recorded status." },
    },
  ] as const;

  it.each(careEntrySchemas)(
    "$name requires caregivers only when care occurred",
    ({ schema, base }) => {
      const shared = {
        childIds: ["child_1"],
        occurredAt: "2026-07-14T18:00:00.000Z",
      };

      for (const status of ["completed", "partial"] as const) {
        expect(
          schema.safeParse({ ...base, ...shared, caregiverIds: [], status })
            .success,
        ).toBe(false);
        expect(
          schema.safeParse({
            ...base,
            ...shared,
            caregiverIds: ["caregiver_1"],
            status,
          }).success,
        ).toBe(true);
      }

      for (const status of ["missed", "not_applicable"] as const) {
        expect(
          schema.safeParse({ ...base, ...shared, caregiverIds: [], status })
            .success,
        ).toBe(true);
        expect(
          schema.safeParse({
            ...base,
            ...shared,
            caregiverIds: ["caregiver_1"],
            status,
          }).success,
        ).toBe(false);
      }
    },
  );

  it.each(careEntrySchemas)(
    "$name rejects care-only details when care did not occur",
    ({ schema, base }) => {
      const shared = {
        ...base,
        childIds: ["child_1"],
        caregiverIds: [],
        status: "missed" as const,
        occurredAt: "2026-07-14T18:00:00.000Z",
      };

      expect(schema.safeParse({ ...shared, durationMinutes: 30 }).success).toBe(
        false,
      );
      expect(schema.safeParse({ ...shared, activityType: "Reading" }).success).toBe(
        false,
      );
      expect(
        schema.safeParse({ ...shared, notes: "The activity did not occur." })
          .success,
      ).toBe(true);
    },
  );

  it("allows an optional bounded note for a daily log", () => {
    expect(
      dailyLogNotesSchema.safeParse({
        localDate: "2026-07-14",
        notes: "  School called about tomorrow's schedule.  ",
      }),
    ).toMatchObject({
      success: true,
      data: { notes: "School called about tomorrow's schedule." },
    });
    expect(
      dailyLogNotesSchema.safeParse({
        localDate: "2026-07-14",
        notes: "",
      }).success,
    ).toBe(true);
    expect(
      dailyLogNotesSchema.safeParse({
        localDate: "2026-07-14",
        notes: "x".repeat(2001),
      }).success,
    ).toBe(false);
  });

  it("requires observable incident detail", () => {
    const result = incidentSchema.safeParse({
      category: "concerning_interaction",
      occurredAt: "2026-07-14T18:00:00.000Z",
      childIds: ["child_1"],
      peoplePresent: [],
      witnesses: [],
      observations: "Upset",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reversed report ranges and empty content", () => {
    const result = reportSchema.safeParse({
      from: "2026-07-15",
      to: "2026-07-14",
      childIds: [],
      includeCare: false,
      includeAppointments: false,
      includeIncidents: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts new caregivers and routine items without persisted ids", () => {
    const result = workspaceSettingsSchema.safeParse({
      name: "Family workspace",
      timezone: "America/Chicago",
      hardDeleteEnabled: false,
      children: [
        { id: "child_1", displayName: "Child one", birthdate: "2018-01-15" },
        { id: "child_2", displayName: "Child two", birthdate: "2020-06-30" },
      ],
      caregivers: [
        { id: "caregiver_1", displayName: "Caregiver", relationship: "Parent" },
        { displayName: "Grandparent", relationship: "Grandparent" },
      ],
      routineItems: [
        {
          label: "Evening walk",
          suggestedTime: "18:30",
          childIds: ["child_1", "child_2"],
          weekdays: [0, 6],
          active: true,
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.caregivers[1].id).toBeUndefined();
      expect(result.data.routineItems[0].weekdays).toEqual([0, 6]);
    }
  });

  it("requires at least one unique valid weekday for each routine item", () => {
    const base = {
      name: "Family workspace",
      timezone: "America/Chicago",
      hardDeleteEnabled: false,
      children: [{ id: "child_1", displayName: "Child one", birthdate: "2018-01-15" }],
      caregivers: [{ id: "caregiver_1", displayName: "Caregiver", relationship: "Parent" }],
      routineItems: [{
        label: "Naptime",
        suggestedTime: "13:00",
        childIds: ["child_1"],
        weekdays: [] as number[],
        active: true,
      }],
    };

    expect(workspaceSettingsSchema.safeParse(base).success).toBe(false);
    expect(workspaceSettingsSchema.safeParse({
      ...base,
      routineItems: [{ ...base.routineItems[0], weekdays: [0, 0] }],
    }).success).toBe(false);
    expect(workspaceSettingsSchema.safeParse({
      ...base,
      routineItems: [{ ...base.routineItems[0], weekdays: [7] }],
    }).success).toBe(false);
  });

  it("validates a complete special-arrangement range and correction reason", () => {
    const arrangement = {
      title: "Camping weekend",
      startDate: "2026-07-24",
      endDate: "2026-07-26",
      assignments: [
        { childId: "child_1", caregiverIds: ["caregiver_1"] },
        { childId: "child_2", caregiverIds: ["caregiver_2"] },
      ],
      days: ["2026-07-24", "2026-07-25", "2026-07-26"].map(
        (localDate) => ({
          localDate,
          tasks: [
            {
              taskKey: "custom",
              childId: "child_1",
              label: "Set up camp",
              suggestedTime: "16:00",
            },
          ],
        }),
      ),
    };

    expect(specialArrangementCreateSchema.safeParse(arrangement).success).toBe(
      true,
    );
    expect(
      specialArrangementCorrectionSchema.safeParse({
        recordId: "arrangement_1",
        title: arrangement.title,
        status: "active",
        assignments: arrangement.assignments,
        tasks: arrangement.days[0].tasks,
        reason: "Fixed the planned caregiver.",
      }).success,
    ).toBe(true);
  });

  it("rejects incomplete, overlong, or ambiguous special arrangements", () => {
    const base = {
      title: "Camping weekend",
      startDate: "2026-07-24",
      endDate: "2026-07-26",
      assignments: [
        { childId: "child_1", caregiverIds: ["caregiver_1"] },
        { childId: "child_1", caregiverIds: ["caregiver_2"] },
      ],
      days: [
        {
          localDate: "2026-07-24",
          tasks: [
            {
              taskKey: "custom",
              childId: "child_missing",
              label: "Set up camp",
              suggestedTime: "16:00",
            },
          ],
        },
      ],
    };

    expect(specialArrangementCreateSchema.safeParse(base).success).toBe(false);
    expect(
      specialArrangementCreateSchema.safeParse({
        ...base,
        startDate: "2026-02-30",
        endDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      specialArrangementCreateSchema.safeParse({
        ...base,
        assignments: [],
      }).success,
    ).toBe(false);
    expect(
      specialArrangementCreateSchema.safeParse({
        ...base,
        assignments: [
          {
            childId: "child_1",
            caregiverIds: ["caregiver_1", "caregiver_1"],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      specialArrangementCreateSchema.safeParse({
        ...base,
        assignments: [{ childId: "child_1", caregiverIds: ["caregiver_1"] }],
        startDate: "2026-07-24",
        endDate: "2026-07-24",
        days: [
          {
            localDate: "2026-07-24",
            tasks: [
              {
                taskKey: "custom",
                childId: "child_1",
                label: "x",
                suggestedTime: "25:00",
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      specialArrangementCreateSchema.safeParse({
        ...base,
        assignments: [{ childId: "child_1", caregiverIds: ["caregiver_1"] }],
        endDate: "2026-08-30",
      }).success,
    ).toBe(false);
    expect(
      specialArrangementCorrectionSchema.safeParse({
        recordId: "arrangement_1",
        title: "Camping weekend",
        status: "active",
        assignments: [{ childId: "child_1", caregiverIds: ["caregiver_1"] }],
        tasks: [],
        reason: "no",
      }).success,
    ).toBe(false);
  });
});
