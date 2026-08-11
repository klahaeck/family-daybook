import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { CARE_STATUS_LABELS, INCIDENT_LABELS, RECORD_DISCLAIMER } from "@/lib/domain/constants";
import { careStatusRecordsProvidedCare, careStatusTimeLabel } from "@/lib/domain/care-entry-rules";
import { formatDateTime } from "@/lib/domain/dates";
import type { ReportSource } from "@/lib/repository/repository";

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingHorizontal: 44,
    paddingBottom: 50,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e2a26",
    lineHeight: 1.5,
  },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#173f35", marginBottom: 8 },
  subtitle: { fontSize: 11, color: "#52635d", marginBottom: 24 },
  heading: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#173f35", marginTop: 20, marginBottom: 8 },
  row: { borderTopWidth: 1, borderTopColor: "#dce6e1", paddingVertical: 8 },
  rowTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  meta: { color: "#687771", fontSize: 8, marginBottom: 3 },
  label: { fontFamily: "Helvetica-Bold" },
  summary: { flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 10 },
  summaryCard: { flexGrow: 1, borderWidth: 1, borderColor: "#dce6e1", borderRadius: 4, padding: 10 },
  summaryNumber: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#173f35" },
  notice: { backgroundColor: "#f3f7f5", padding: 10, borderRadius: 4, color: "#52635d", marginTop: 18 },
  footer: { position: "absolute", left: 44, right: 44, bottom: 22, flexDirection: "row", justifyContent: "space-between", color: "#71807b", fontSize: 7 },
});

function names(ids: string[], values: Array<{ id: string; displayName: string }>) {
  return ids.map((id) => values.find((item) => item.id === id)?.displayName ?? "Unknown").join(", ");
}

export function ReportDocument({ source }: { source: ReportSource }) {
  const timezone = source.workspace.timezone;
  const careCompleted = source.entries.filter((entry) => entry.status === "completed").length;
  return (
    <Document
      title={`Parenting log ${source.snapshot.filters.from} to ${source.snapshot.filters.to}`}
      author={source.workspace.name}
      subject="Factual parenting log export"
    >
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Daily parenting log</Text>
        <Text style={styles.subtitle}>{source.workspace.name}</Text>
        <Text>
          <Text style={styles.label}>Date range: </Text>
          {source.snapshot.filters.from} through {source.snapshot.filters.to}
        </Text>
        <Text>
          <Text style={styles.label}>Generated: </Text>
          {formatDateTime(source.snapshot.createdAt, timezone)}
        </Text>
        <Text>
          <Text style={styles.label}>Report ID: </Text>
          {source.snapshot.id}
        </Text>

        <View style={styles.summary}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryNumber}>{source.entries.length}</Text>
            <Text>Routine item records</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryNumber}>{careCompleted}</Text>
            <Text>Marked completed</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryNumber}>{source.appointments.length}</Text>
            <Text>Appointments</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryNumber}>{source.incidents.length}</Text>
            <Text>Incidents</Text>
          </View>
        </View>

        <View style={styles.notice}>
          <Text>{RECORD_DISCLAIMER}</Text>
          <Text>Counts are descriptive only and are not evaluations or parenting scores.</Text>
        </View>

        {source.arrangements.length > 0 && (
          <View>
            <Text style={styles.heading}>Planned arrangements</Text>
            <View style={styles.notice}>
              <Text>
                These arrangements describe saved plans and responsibility
                assignments. They do not establish that the planned care occurred;
                routine item records below distinguish care recorded as completed
                or partial from items marked missed or not applicable.
              </Text>
            </View>
            {source.arrangements.map((arrangement) => (
              <View key={arrangement.id} style={styles.row} wrap={false}>
                <Text style={styles.rowTitle}>{arrangement.title}</Text>
                <Text style={styles.meta}>
                  Planned for {arrangement.localDate} · Created{" "}
                  {formatDateTime(arrangement.createdAt, timezone)} · Last updated{" "}
                  {formatDateTime(arrangement.updatedAt, timezone)}
                </Text>
                {arrangement.assignments.map((assignment) => (
                  <Text key={assignment.childId}>
                    Planned responsibility:{" "}
                    {names([assignment.childId], source.children)} —{" "}
                    {names(assignment.caregiverIds, source.caregivers)}
                  </Text>
                ))}
                {arrangement.tasks.map((task) => (
                  <Text key={task.id}>
                    Planned task: {task.suggestedTime} ·{" "}
                    {names([task.childId], source.children)} · {task.label}
                  </Text>
                ))}
                {arrangement.note && <Text>Context: {arrangement.note}</Text>}
              </View>
            ))}
          </View>
        )}

        {source.entries.length > 0 && (
          <View>
            <Text style={styles.heading}>Routine item records</Text>
            {source.entries.map((entry) => (
              <View key={entry.id} style={styles.row} wrap={false}>
                <Text style={styles.rowTitle}>{entry.taskLabel}</Text>
                <Text style={styles.meta}>
                  {careStatusTimeLabel(entry.status)} {formatDateTime(entry.occurredAt, timezone)} · Entered {formatDateTime(entry.recordedAt, timezone)}
                </Text>
                <Text>
                  Children: {names(entry.childIds, source.children)} · Status: {CARE_STATUS_LABELS[entry.status]}
                </Text>
                {careStatusRecordsProvidedCare(entry.status) && (
                  <Text>Caregiver: {names(entry.caregiverIds, source.caregivers)}</Text>
                )}
                {entry.durationMinutes && <Text>Duration: {entry.durationMinutes} minutes</Text>}
                {entry.notes && <Text>Notes: {entry.notes}</Text>}
                {entry.lateEntry && <Text>Late entry: recorded after the following calendar day.</Text>}
              </View>
            ))}
          </View>
        )}

        {source.appointments.length > 0 && (
          <View>
            <Text style={styles.heading}>Appointments</Text>
            {source.appointments.map((appointment) => (
              <View key={appointment.id} style={styles.row} wrap={false}>
                <Text style={styles.rowTitle}>{appointment.title}</Text>
                <Text style={styles.meta}>
                  Scheduled {formatDateTime(appointment.scheduledAt, timezone)} · Entered {formatDateTime(appointment.recordedAt, timezone)}
                </Text>
                <Text>
                  Children: {names(appointment.childIds, source.children)} · Responsible: {names(appointment.responsibleCaregiverIds, source.caregivers)} · Outcome: {appointment.status}
                </Text>
                {appointment.notes && <Text>Notes: {appointment.notes}</Text>}
              </View>
            ))}
          </View>
        )}

        {source.incidents.length > 0 && (
          <View>
            <Text style={styles.heading}>Factual incidents</Text>
            {source.incidents.map((incident) => (
              <View key={incident.id} style={styles.row} wrap={false}>
                <Text style={styles.rowTitle}>{INCIDENT_LABELS[incident.category]}</Text>
                <Text style={styles.meta}>
                  Occurred {formatDateTime(incident.occurredAt, timezone)} · Entered {formatDateTime(incident.recordedAt, timezone)}
                </Text>
                <Text>Children: {names(incident.childIds, source.children)}</Text>
                <Text>Observed facts: {incident.observations}</Text>
                {incident.exactQuotes && <Text>Exact quotes: {incident.exactQuotes}</Text>}
                {incident.immediateActions && <Text>Immediate actions: {incident.immediateActions}</Text>}
                {incident.outcome && <Text>Outcome: {incident.outcome}</Text>}
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{source.snapshot.id}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
