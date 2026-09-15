import {
  apiErrorSchema,
  appointmentInputSchema,
  appointmentSchema,
  daySchema,
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
});
