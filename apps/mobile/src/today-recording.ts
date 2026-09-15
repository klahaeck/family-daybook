import type { CareEntry, Day } from "@family-daybook/contracts";

import { localDateTimeIso } from "@/utils";

type TodayTask = Day["tasks"][number];
type CareStatus = CareEntry["status"];

type RecordingValues = {
  date: string;
  timeZone: string;
  task: TodayTask;
  status: CareStatus;
  localTime: string;
  caregiverIds: string[];
};

export function recordingRequestForTask({ date, timeZone, task, status, localTime, caregiverIds }: RecordingValues) {
  const providedCare = status === "completed" || status === "partial";
  const common = {
    status,
    childIds: task.childIds,
    caregiverIds: providedCare ? caregiverIds : [],
  };

  if (task.source === "special_arrangement") {
    if (!task.arrangementTaskId) throw new Error("That special-day task is no longer available.");
    return {
      kind: "special_arrangement" as const,
      input: {
        localDate: date,
        source: { kind: "special_arrangement" as const, arrangementTaskId: task.arrangementTaskId },
        ...common,
        occurredAt: localDateTimeIso(date, localTime, timeZone),
      },
    };
  }

  if (!task.templateItemId) throw new Error("That routine is no longer available.");
  return {
    kind: "routine" as const,
    input: {
      routineId: task.templateItemId,
      ...common,
      localTime: providedCare ? localTime : undefined,
    },
  };
}
