import {
  apiErrorSchema,
  appointmentInputSchema,
  appointmentSchema,
  daySchema,
  listIncidentsSchema,
} from "@family-daybook/contracts";

describe("mobile API contracts", () => {
  it("retains arrival and cancellation details returned for appointments", () => {
    const appointment = appointmentSchema.parse({
      id: "appointment_1",
      title: "Pediatrician",
      childIds: ["child_1"],
      scheduledAt: "2026-09-16T15:00:00.000Z",
      responsibleCaregiverIds: ["caregiver_1"],
      status: "rescheduled",
      arrivedAt: "2026-09-16T14:55:00.000Z",
      cancellationDetails: "Moved to Friday at the provider's request.",
      currentRevisionId: "revision_1",
    });

    expect(appointment.arrivedAt).toBe("2026-09-16T14:55:00.000Z");
    expect(appointment.cancellationDetails).toBe("Moved to Friday at the provider's request.");
  });

  it("accepts those fields when creating an appointment", () => {
    expect(appointmentInputSchema.parse({
      title: "Dentist",
      childIds: ["child_1"],
      scheduledAt: "2026-09-17T15:00:00.000Z",
      responsibleCaregiverIds: ["caregiver_1"],
      status: "late",
      arrivedAt: "2026-09-17T15:10:00.000Z",
      cancellationDetails: undefined,
    }).arrivedAt).toBe("2026-09-17T15:10:00.000Z");
  });

  it.each([
    "API_AUTH_UNAVAILABLE",
    "MOBILE_API_DISABLED",
    "MOBILE_API_MAINTENANCE",
    "MONGODB_REQUIRED",
    "ACCOUNT_DELETION_IN_PROGRESS",
  ] as const)("recognizes the %s infrastructure error", (code) => {
    expect(apiErrorSchema.parse({ error: { code, message: "Unavailable" } }).error.code).toBe(code);
  });

  it("retains finalized and special-arrangement day details", () => {
    const day = daySchema.parse({
      localDate: "2026-09-15",
      status: "finalized",
      finalizedAt: "2026-09-15T23:00:00.000Z",
      dayVersion: "version_1",
      tasks: [],
      specialArrangement: {
        id: "arrangement_1",
        localDate: "2026-09-15",
        title: "School holiday",
        note: "Grandparent coverage",
        status: "active",
        assignments: [{ childId: "child_1", caregiverIds: ["caregiver_1"] }],
        tasks: [{
          id: "task_1",
          taskKey: "custom",
          childId: "child_1",
          label: "Library visit",
          suggestedTime: "10:00",
          sortOrder: 0,
        }],
      },
      careEntries: [],
      completion: { recorded: 0, total: 0, percent: 0 },
    });

    expect(day.finalizedAt).toBe("2026-09-15T23:00:00.000Z");
    expect(day.specialArrangement?.assignments).toEqual([{ childId: "child_1", caregiverIds: ["caregiver_1"] }]);
    expect(day.specialArrangement?.tasks[0]).toMatchObject({ id: "task_1", label: "Library visit" });
  });

  it("normalizes nullable legacy care-entry relationship ids", () => {
    const day = daySchema.parse({
      localDate: "2026-09-15",
      status: "open",
      dayVersion: "version_1",
      tasks: [],
      careEntries: [{
        id: "care_1",
        dailyLogId: "daily_log_1",
        templateItemId: "routine_item_1",
        arrangementTaskId: null,
        taskKey: "prepare_breakfast",
        taskLabel: "Prepare breakfast",
        childIds: ["child_1"],
        caregiverIds: ["caregiver_1"],
        status: "completed",
        occurredAt: "2026-09-15T13:00:00.000Z",
        recordedAt: "2026-09-15T13:05:00.000Z",
        currentRevisionId: "revision_1",
        lateEntry: false,
      }],
      completion: { recorded: 1, total: 1, percent: 100 },
    });

    expect(day.careEntries[0]).toMatchObject({
      templateItemId: "routine_item_1",
      arrangementTaskId: undefined,
    });
  });

  it("normalizes nullable and omitted legacy incident details", () => {
    const result = listIncidentsSchema.parse({
      incidents: [{
        id: "incident_1",
        category: "other",
        occurredAt: "2026-09-15T13:00:00.000Z",
        discoveredAt: null,
        location: null,
        childIds: ["child_1"],
        witnesses: null,
        observations: "The child slipped near the kitchen doorway.",
        exactQuotes: null,
        immediateActions: null,
        outcome: null,
        currentRevisionId: "revision_1",
      }],
      attachments: [],
    });

    expect(result.incidents[0]).toMatchObject({
      discoveredAt: undefined,
      location: undefined,
      peoplePresent: [],
      witnesses: [],
      exactQuotes: undefined,
      immediateActions: undefined,
      outcome: undefined,
    });
  });
});
