import type {
  Appointment,
  CareEntry,
  DailyLog,
  Incident,
  RecordRevision,
  RoutineTemplateItem,
  SpecialArrangementDay,
  TimelineItem,
} from "@/lib/domain/types";
import type { WorkspaceSettingsInput } from "@/lib/domain/schemas";
import { lateEntryFor, localDateTimeToUtc } from "@/lib/domain/dates";
import { id } from "@/lib/domain/integrity";

export function requireOwner(role: string): void {
  if (role !== "owner") throw new Error("FORBIDDEN");
}

export function createNextRoutineItems(
  currentItems: RoutineTemplateItem[],
  inputItems: WorkspaceSettingsInput["routineItems"],
): RoutineTemplateItem[] {
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const submittedIds = new Set<string>();

  return inputItems.map((input, index) => {
    const current = input.id ? currentById.get(input.id) : undefined;
    if (input.id && (!current || submittedIds.has(input.id))) {
      throw new Error("INVALID_ROUTINE_ITEM");
    }
    if (input.id) submittedIds.add(input.id);

    return {
      id: current?.id ?? id("routine"),
      taskKey: current?.taskKey ?? "custom",
      label: input.label,
      childIds: input.childIds,
      weekdays: input.weekdays,
      suggestedTime: input.suggestedTime,
      sortOrder: index + 1,
      active: input.active,
    };
  });
}

export function withCurrentLateEntryStatus(
  entry: CareEntry,
  timezone: string,
): CareEntry {
  return {
    ...entry,
    lateEntry: lateEntryFor(entry.occurredAt, entry.recordedAt, timezone),
  };
}

export function toTimelineItems(input: {
  entries: CareEntry[];
  appointments: Appointment[];
  incidents: Incident[];
  arrangements: SpecialArrangementDay[];
  dailyLogs: DailyLog[];
  timezone: string;
}): TimelineItem[] {
  return [
    ...input.entries.map(
      (storedEntry): TimelineItem => {
        const entry = withCurrentLateEntryStatus(storedEntry, input.timezone);
        return {
          id: entry.id,
          kind: "care",
          occurredAt: entry.occurredAt,
          recordedAt: entry.recordedAt,
          title: entry.taskLabel,
          description: entry.notes,
          childIds: entry.childIds,
          caregiverIds: entry.caregiverIds,
          status: entry.status,
          durationMinutes: entry.durationMinutes,
          lateEntry: entry.lateEntry,
          dailyLogStatus: input.dailyLogs.find((log) => log.id === entry.dailyLogId)?.status,
          currentRevisionId: entry.currentRevisionId,
        };
      },
    ),
    ...input.appointments.map(
      (appointment): TimelineItem => ({
        id: appointment.id,
        kind: "appointment",
        occurredAt: appointment.scheduledAt,
        recordedAt: appointment.recordedAt,
        title: appointment.title,
        description: appointment.notes,
        childIds: appointment.childIds,
        caregiverIds: appointment.responsibleCaregiverIds,
        status: appointment.status,
        currentRevisionId: appointment.currentRevisionId,
      }),
    ),
    ...input.incidents.map(
      (incident): TimelineItem => ({
        id: incident.id,
        kind: "incident",
        occurredAt: incident.occurredAt,
        recordedAt: incident.recordedAt,
        title:
          incident.category === "safety_hazard"
            ? "Safety hazard"
            : incident.category === "concerning_interaction"
              ? "Concerning interaction"
              : "Factual incident",
        description: incident.observations,
        childIds: incident.childIds,
        caregiverIds: [],
        status: incident.category,
        currentRevisionId: incident.currentRevisionId,
      }),
    ),
    ...input.arrangements.map(
      (arrangement): TimelineItem => ({
        id: arrangement.id,
        kind: "special_day",
        occurredAt: localDateTimeToUtc(
          `${arrangement.localDate}T12:00`,
          input.timezone,
        ),
        recordedAt: arrangement.createdAt,
        localDate: arrangement.localDate,
        title: arrangement.title,
        description: arrangement.note,
        childIds: arrangement.assignments.map(
          (assignment) => assignment.childId,
        ),
        caregiverIds: [
          ...new Set(
            arrangement.assignments.flatMap(
              (assignment) => assignment.caregiverIds,
            ),
          ),
        ],
        status: arrangement.status,
        dailyLogStatus: input.dailyLogs.find(
          (log) => log.id === arrangement.dailyLogId,
        )?.status,
        currentRevisionId: arrangement.currentRevisionId,
      }),
    ),
  ].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

export function recordPayload(
  record: CareEntry | Appointment | Incident,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}

export function arrangementAtIncludedRevision(
  arrangement: SpecialArrangementDay,
  revisions: RecordRevision[],
): SpecialArrangementDay | null {
  const revision = revisions
    .filter(
      (item) =>
        item.recordType === "special_arrangement" &&
        item.recordId === arrangement.id,
    )
    .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
  if (!revision) return null;

  return {
    ...arrangement,
    ...(revision.payload as Partial<SpecialArrangementDay>),
    currentRevisionId: revision.id,
  };
}

export function arrangementForChildren(
  arrangement: SpecialArrangementDay,
  childIds: string[],
): SpecialArrangementDay {
  if (childIds.length === 0) return arrangement;
  const included = new Set(childIds);
  return {
    ...arrangement,
    assignments: arrangement.assignments.filter((assignment) =>
      included.has(assignment.childId),
    ),
    tasks: arrangement.tasks.filter((task) => included.has(task.childId)),
  };
}
