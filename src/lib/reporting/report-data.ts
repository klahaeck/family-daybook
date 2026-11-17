import { CARE_STATUS_LABELS, INCIDENT_LABELS } from "@/lib/domain/constants";
import { localDateInTimezone } from "@/lib/domain/dates";
import type { ReportSource } from "@/lib/repository/repository";

export function reportChildren(source: ReportSource) {
  const selected = source.snapshot.filters.childIds;
  return source.children.filter((child) => !selected.length || selected.includes(child.id));
}

export function reportNames(ids: string[], values: Array<{ id: string; displayName: string }>) {
  return ids.map((id) => values.find((value) => value.id === id)?.displayName ?? id).join(", ");
}

export interface ReportEvent {
  id: string;
  revisionId: string;
  type: string;
  childIds: string[];
  at: string;
  recordedAt: string;
  title: string;
  status: string;
  caregiverIds: string[];
  details: Record<string, unknown>;
}

export function reportEvents(source: ReportSource): ReportEvent[] {
  return [
    ...source.entries.map((entry) => ({
      id: entry.id, revisionId: entry.currentRevisionId, type: "Routine item",
      childIds: entry.childIds, at: entry.occurredAt, recordedAt: entry.recordedAt,
      title: entry.taskLabel, status: CARE_STATUS_LABELS[entry.status],
      caregiverIds: entry.caregiverIds, details: { ...entry },
    })),
    ...source.appointments.map((appointment) => ({
      id: appointment.id, revisionId: appointment.currentRevisionId, type: "Appointment",
      childIds: appointment.childIds, at: appointment.scheduledAt, recordedAt: appointment.recordedAt,
      title: appointment.title, status: appointment.status,
      caregiverIds: appointment.responsibleCaregiverIds, details: { ...appointment },
    })),
    ...source.incidents.map((incident) => ({
      id: incident.id, revisionId: incident.currentRevisionId, type: "Incident",
      childIds: incident.childIds, at: incident.occurredAt, recordedAt: incident.recordedAt,
      title: INCIDENT_LABELS[incident.category], status: "Recorded",
      caregiverIds: [], details: { ...incident },
    })),
    ...source.arrangements.map((day) => ({
      id: day.id, revisionId: day.currentRevisionId, type: "Special day (plan)",
      childIds: day.assignments.map((assignment) => assignment.childId),
      at: day.localDate, recordedAt: day.createdAt, title: day.title, status: day.status,
      caregiverIds: [...new Set(day.assignments.flatMap((assignment) => assignment.caregiverIds))],
      details: { ...day },
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}

export function reportLocalDate(at: string, timezone: string) {
  return at.length === 10 ? at : localDateInTimezone(new Date(at), timezone);
}

export function summarizeReport(source: ReportSource) {
  const events = reportEvents(source).filter((event) => event.type !== "Special day (plan)");
  const { from, to } = source.snapshot.filters;
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const bucketDays = days <= 31 ? 1 : days <= 180 ? 7 : Math.ceil(days / 24);
  const trend = [];
  for (let offset = 0; offset < days; offset += bucketDays) {
    const start = new Date(Date.parse(from) + offset * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.parse(from) + Math.min(offset + bucketDays - 1, days - 1) * 86_400_000).toISOString().slice(0, 10);
    trend.push({ label: start === end ? start : `${start} - ${end}`, count: 0 });
  }
  for (const event of events) {
    const date = reportLocalDate(event.at, source.workspace.timezone);
    const index = Math.floor((Date.parse(date) - Date.parse(from)) / 86_400_000 / bucketDays);
    if (trend[index]) trend[index].count++;
  }
  const counts = new Map<string, number>();
  for (const entry of source.entries) counts.set(entry.taskLabel, (counts.get(entry.taskLabel) ?? 0) + 1);
  const activities = [...counts].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    totalEvents: events.length,
    trend,
    bucketDays,
    statuses: Object.entries(CARE_STATUS_LABELS).map(([status, label]) => ({
      label, count: source.entries.filter((entry) => entry.status === status).length,
    })),
    children: reportChildren(source).map((child) => ({
      label: child.displayName, count: events.filter((event) => event.childIds.includes(child.id)).length,
    })),
    activities,
  };
}
