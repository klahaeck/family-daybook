import type { Day } from "@family-daybook/contracts";

import { recordingRequestForTask } from "./today-recording";

function task(value: Partial<Day["tasks"][number]>): Day["tasks"][number] {
  return {
    id: "task_1",
    source: "routine",
    templateItemId: "routine_1",
    taskKey: "prepare_breakfast",
    label: "Prepare breakfast",
    childIds: ["child_1"],
    suggestedTime: "07:30",
    sortOrder: 0,
    plannedCaregiverIds: ["caregiver_1"],
    recorded: false,
    ...value,
  };
}

describe("recordingRequestForTask", () => {
  it("uses the routine endpoint contract for routine tasks", () => {
    expect(recordingRequestForTask({
      date: "2026-09-15",
      timeZone: "America/Chicago",
      task: task({}),
      status: "completed",
      localTime: "07:45",
      caregiverIds: ["caregiver_1"],
    })).toEqual({
      kind: "routine",
      input: {
        routineId: "routine_1",
        status: "completed",
        childIds: ["child_1"],
        caregiverIds: ["caregiver_1"],
        localTime: "07:45",
      },
    });
  });

  it("uses the special-arrangement record contract and workspace timezone", () => {
    expect(recordingRequestForTask({
      date: "2026-09-15",
      timeZone: "America/Chicago",
      task: task({ source: "special_arrangement", templateItemId: undefined, arrangementTaskId: "arrangement_task_1" }),
      status: "missed",
      localTime: "07:30",
      caregiverIds: ["caregiver_1"],
    })).toEqual({
      kind: "special_arrangement",
      input: {
        localDate: "2026-09-15",
        source: { kind: "special_arrangement", arrangementTaskId: "arrangement_task_1" },
        status: "missed",
        childIds: ["child_1"],
        caregiverIds: [],
        occurredAt: "2026-09-15T12:30:00.000Z",
      },
    });
  });
});
