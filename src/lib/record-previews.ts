import { previewQuery, savingRecord, upsertRecord } from "@family-daybook/api-client/record-saving";
import type { Appointment, CareEntry, DashboardData, Incident, IncidentsData, RecordType, TimelineData, TimelineItem } from "@/lib/domain/types";

// Temporary identity and empty audit fields are presentation-only. The server owns them.
export function pendingIdentity() {
  return { id: `pending:${crypto.randomUUID()}`, workspaceId: "", recordedAt: "", currentRevisionId: "", createdBy: "" };
}

function timelinePreview(item: TimelineItem) {
  return previewQuery<TimelineData>(["timeline"], (data, { savedId, confirmed }) => ({
    ...data,
    items: upsertRecord(data.items, savingRecord(data.items.find((value) => value.id === savedId) ?? item, savedId, !confirmed))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  }));
}

export function carePreview(entry: CareEntry, date: string, taskId?: string, dailyLogStatus: "open" | "finalized" = "open") {
  return [
    previewQuery<DashboardData>(["dashboard", date], (data, { savedId, confirmed }) => {
      const record = savingRecord(data.recentEntries.find((value) => value.id === savedId) ?? entry, savedId, !confirmed);
      const tasks = data.tasks.map((task) => task.id === taskId || task.entry?.id === entry.id ? { ...task, entry: record } : task);
      const recorded = tasks.filter((task) => task.entry).length;
      return { ...data, tasks, recentEntries: upsertRecord(data.recentEntries, record), completion: {
        recorded, total: tasks.length, percent: tasks.length ? Math.round(recorded / tasks.length * 100) : 0,
      } };
    }),
    timelinePreview({ id: entry.id, kind: "care", title: entry.taskLabel, description: entry.notes,
      occurredAt: entry.occurredAt, recordedAt: entry.recordedAt, childIds: entry.childIds,
      caregiverIds: entry.caregiverIds, status: entry.status, currentRevisionId: entry.currentRevisionId, localDate: date, dailyLogStatus }),
  ];
}

export function appointmentPreview(record: Appointment) {
  return [
    previewQuery<Appointment[]>(["appointments"], (data, { savedId, confirmed }) =>
      upsertRecord(data, savingRecord(data.find((value) => value.id === savedId) ?? record, savedId, !confirmed))),
    timelinePreview({ id: record.id, kind: "appointment", title: record.title, description: record.notes,
      occurredAt: record.scheduledAt, recordedAt: record.recordedAt, childIds: record.childIds,
      caregiverIds: record.responsibleCaregiverIds, status: record.status, currentRevisionId: record.currentRevisionId }),
  ];
}

export function incidentPreview(record: Incident) {
  return [
    previewQuery<IncidentsData>(["incidents"], (data, { savedId, confirmed }) => ({ ...data,
      incidents: upsertRecord(data.incidents, savingRecord(data.incidents.find((value) => value.id === savedId) ?? record, savedId, !confirmed)),
    })),
    timelinePreview({ id: record.id, kind: "incident", title: "Factual incident", description: record.observations,
      occurredAt: record.occurredAt, recordedAt: record.recordedAt, childIds: record.childIds,
      caregiverIds: [], status: record.category, currentRevisionId: record.currentRevisionId }),
  ];
}

export function textPreview(recordType: RecordType, recordId: string, text: string) {
  return [
    previewQuery<TimelineData>(["timeline"], (data) => ({ ...data, items: data.items.map((item) =>
      item.id === recordId ? savingRecord({ ...item, description: text }) : item) })),
    previewQuery<Appointment[]>(["appointments"], (data) => data.map((item) => recordType === "appointment" && item.id === recordId ? savingRecord({ ...item, notes: text }) : item)),
    previewQuery<IncidentsData>(["incidents"], (data) => ({ ...data, incidents: data.incidents.map((item) => recordType === "incident" && item.id === recordId ? savingRecord({ ...item, observations: text }) : item) })),
    previewQuery<DashboardData>(["dashboard"], (data) => ({ ...data, tasks: data.tasks.map((task) => task.entry?.id === recordId ? { ...task, entry: savingRecord({ ...task.entry, notes: text }) } : task) })),
  ];
}
