import type { Appointment, CareEntry, Day, Incident, RecordBundle, Timeline } from "@family-daybook/contracts";
import { previewQuery, savingRecord, upsertRecord } from "@family-daybook/api-client/record-saving";
import { randomUUID } from "expo-crypto";

export const pendingIdentity = () => ({ id: `pending:${randomUUID()}`, currentRevisionId: "", recordedAt: "" });

// New items belong only on the newest page of the matching timeline filter.
function timelinePreview(item: Timeline["items"][number]) {
  return [undefined, item.kind].map((kind) => previewQuery<Timeline>(["timeline", kind, undefined], (data, { savedId, confirmed }) => confirmed && !item.recordedAt ? data : ({
    ...data, items: upsertRecord(data.items, savingRecord(data.items.find((value) => value.id === savedId) ?? item, savedId, !confirmed))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  })));
}

export function carePreview(entry: CareEntry, date: string, taskId?: string) {
  return [
    previewQuery<Day>(["day", date], (data, { savedId, confirmed }) => {
      const record = savingRecord(data.careEntries.find((value) => value.id === savedId) ?? entry, savedId, !confirmed);
      const tasks = data.tasks.map((task) => task.id === taskId || task.entryId === entry.id ? { ...task, entryId: record.id, recorded: true } : task);
      const recorded = tasks.filter((task) => task.recorded).length;
      return { ...data, tasks, careEntries: upsertRecord(data.careEntries, record), completion: {
        recorded, total: tasks.length, percent: tasks.length ? Math.round(recorded / tasks.length * 100) : 0,
      } };
    }),
    previewQuery<RecordBundle>(["record", "care_entry", entry.id], (data, { confirmed }) => confirmed ? data : ({ ...data, record: savingRecord(entry) })),
    ...timelinePreview({ id: entry.id, kind: "care", title: entry.taskLabel, description: entry.notes,
      occurredAt: entry.occurredAt, recordedAt: entry.recordedAt, childIds: entry.childIds,
      caregiverIds: entry.caregiverIds, status: entry.status, localDate: date }),
  ];
}

export function appointmentPreview(record: Appointment) {
  return [
    previewQuery<Appointment[]>(["appointments"], (data, { savedId, confirmed }) => upsertRecord(data, savingRecord(data.find((value) => value.id === savedId) ?? record, savedId, !confirmed))),
    ...timelinePreview({ id: record.id, kind: "appointment", title: record.title, description: record.notes,
      occurredAt: record.scheduledAt, recordedAt: "", childIds: record.childIds,
      caregiverIds: record.responsibleCaregiverIds, status: record.status }),
  ];
}

export function incidentPreview(record: Incident) {
  return [
    previewQuery<{ incidents: Incident[]; attachments: unknown[] }>(["incidents"], (data, { savedId, confirmed }) => ({ ...data,
      incidents: upsertRecord(data.incidents, savingRecord(data.incidents.find((value) => value.id === savedId) ?? record, savedId, !confirmed)),
    })),
    ...timelinePreview({ id: record.id, kind: "incident", title: "Factual incident", description: record.observations,
      occurredAt: record.occurredAt, recordedAt: "", childIds: record.childIds, caregiverIds: [], status: record.category }),
  ];
}

export function textPreview(recordType: "appointment" | "incident", recordId: string, text: string) {
  const update = <T extends { id: string }>(record: T) => record.id === recordId
    ? savingRecord({ ...record, ...(recordType === "incident" ? { observations: text } : { notes: text }) }) : record;
  return [
    previewQuery<RecordBundle>(["record", recordType, recordId], (data) => ({ ...data, record: update(data.record) })),
    previewQuery<Appointment[]>(["appointments"], (data) => recordType === "appointment" ? data.map(update) : data),
    previewQuery<{ incidents: Incident[]; attachments: unknown[] }>(["incidents"], (data) => recordType === "incident" ? { ...data, incidents: data.incidents.map(update) } : data),
    previewQuery<Timeline>(["timeline"], (data) => ({ ...data, items: data.items.map((item) => item.id === recordId ? savingRecord({ ...item, description: text }) : item) })),
  ];
}
