import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { INCIDENT_LABELS, RECORD_DISCLAIMER } from "@/lib/domain/constants";
import { formatDateTime } from "@/lib/domain/dates";
import type { ReportSource } from "@/lib/repository/repository";
import { reportNames, summarizeReport } from "./report-data";
import { reportAttachmentPath } from "./attachment-path";

const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingHorizontal: 44, paddingBottom: 50, fontFamily: "Helvetica", fontSize: 9, color: "#1e2a26", lineHeight: 1.5 },
  title: { fontSize: 24, lineHeight: 1.25, fontFamily: "Helvetica-Bold", color: "#173f35", marginBottom: 8 },
  subtitle: { fontSize: 11, lineHeight: 1.5, color: "#52635d", marginBottom: 16 },
  heading: { fontSize: 14, lineHeight: 1.4, fontFamily: "Helvetica-Bold", color: "#173f35", marginTop: 20, marginBottom: 8 },
  row: { borderTopWidth: 1, borderTopColor: "#dce6e1", paddingVertical: 8 },
  rowTitle: { fontSize: 10, lineHeight: 1.5, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  meta: { color: "#687771", fontSize: 8, marginBottom: 4 },
  summary: { flexDirection: "row", gap: 8, marginTop: 16, marginBottom: 10 },
  card: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: "#dce6e1", borderRadius: 4, padding: 10 },
  number: { fontSize: 20, lineHeight: 1.3, fontFamily: "Helvetica-Bold", color: "#173f35" },
  notice: { backgroundColor: "#f3f7f5", padding: 10, borderRadius: 4, color: "#52635d", marginTop: 12 },
  chartRow: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 8 },
  chartLabel: { width: 162, fontSize: 8 },
  track: { flexGrow: 1, height: 10, backgroundColor: "#edf2ef" },
  bar: { height: 10, backgroundColor: "#287461" },
  count: { width: 28, textAlign: "right", fontSize: 8 },
  footer: { position: "absolute", left: 44, right: 44, bottom: 22, flexDirection: "row", justifyContent: "space-between", color: "#71807b", fontSize: 7 },
});

function Chart({ title, rows, note }: { title: string; rows: Array<{ label: string; count: number }>; note: string }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return <View>
    <View minPresenceAhead={60}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.meta}>{note} Bar scale: 0 to {max} records.</Text>
    </View>
    {rows.length === 0 && <Text style={styles.meta}>No included records.</Text>}
    {rows.map((row, index) => <View key={`${row.label}-${index}`} style={styles.chartRow} wrap={false}>
      <Text style={styles.chartLabel}>{row.label}</Text>
      <View style={styles.track}><View style={[styles.bar, { width: `${row.count / max * 100}%` }]} /></View>
      <Text style={styles.count}>{row.count}</Text>
    </View>)}
  </View>;
}

export function ReportDocument({ source }: { source: ReportSource }) {
  const summary = summarizeReport(source);
  const timezone = source.workspace.timezone;
  const included = [
    source.snapshot.filters.includeCare && "routine items",
    source.snapshot.filters.includeAppointments && "appointments",
    source.snapshot.filters.includeIncidents && "incidents",
  ].filter(Boolean).join(", ") || "none";
  return <Document title={`Daily log overview ${source.snapshot.filters.from} to ${source.snapshot.filters.to}`} author={source.workspace.name} subject="Factual daily log overview and charts">
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.title}>Daily log overview</Text>
      <Text style={styles.subtitle}>{source.workspace.name} | {source.snapshot.filters.from} through {source.snapshot.filters.to}</Text>
      <Text style={styles.meta}>Generated {formatDateTime(source.snapshot.createdAt, timezone)} | Timezone: {timezone}</Text>
      <Text style={styles.meta}>Children: {summary.children.map((child) => child.label).join(", ") || "None"} | Included event types: {included}</Text>
      <View style={styles.summary} wrap={false}>
        {[
          [summary.totalEvents, "Logged events"], [source.entries.length, "Routine items"],
          [source.appointments.length, "Appointments"], [source.incidents.length, "Incidents"],
          [source.arrangements.length, "Special days (plans)"],
        ].map(([value, label]) => <View key={label} style={styles.card}><Text style={styles.number}>{value}</Text><Text>{label}</Text></View>)}
      </View>
      <View style={styles.notice}>
        <Text>{RECORD_DISCLAIMER}</Text>
        <Text>Counts are descriptive, not parenting scores. Routine items and special days come only from finalized daily logs. Appointments and incidents use the selected date and child filters.</Text>
        <Text>Each event is counted once in overall totals. Special-day plans are separate from logged events. No record does not mean no care occurred.</Text>
      </View>
      <Chart title="Logged events over time" rows={summary.trend} note={`Routine items, appointments and incidents; ${summary.bucketDays === 1 ? "daily" : `${summary.bucketDays}-day`} buckets in ${timezone}. Local boundary rows retain snapshot events falling outside the selected local dates.`} />
      <Chart title="Events by child" rows={summary.children} note="Shared events count once for each affected child. Do not sum child totals to obtain overall totals." />
      <Chart title="Records by caregiver" rows={summary.caregivers} note={`Completed or partial routine care records only. Included records: ${summary.careRecordCount}. Shared records count once per caregiver, not per child. Excludes appointments, incidents and special-day plans; totals are not parenting scores.`} />
      {summary.caregivers.filter((caregiver) => caregiver.count > 0).map((caregiver) => <View key={caregiver.id} style={styles.row}>
        <Text style={styles.rowTitle} minPresenceAhead={40}>{caregiver.label} | Care records: {caregiver.count}</Text>
        {caregiver.recordItems.map((item) => <View key={item.label} style={styles.chartRow} wrap={false}>
          <Text style={[styles.chartLabel, { flexGrow: 1 }]}>{item.label}</Text>
          <Text style={styles.count}>{item.count}</Text>
        </View>)}
      </View>)}
      <Chart title="Routine item status" rows={summary.statuses} note={source.snapshot.filters.includeCare ? "All included routine items, including missed and not applicable records." : "Routine items were excluded by the report filters."} />
      <Chart title="Routine activities" rows={summary.activities.slice(0, 12)} note="Counts by activity, across all recorded statuses. Top 12 shown; all details are in the workbook." />
      <View style={styles.notice}>
        <Text>The evidence ZIP contains daily-log.xlsx: All Events lists each record once, and child tabs show the same records filtered per child. It includes timestamps, statuses and notes, plus special-day plans clearly labeled as plans.</Text>
      </View>
      <Text style={styles.heading} minPresenceAhead={90}>Incidents</Text>
      {!source.snapshot.filters.includeIncidents ? <Text>Incidents were excluded by the report filters.</Text> : source.incidents.length === 0 ? <Text>No incidents recorded in this selection.</Text> : source.incidents.map((incident) => <View key={incident.id} style={styles.row}>
        <Text style={styles.rowTitle} minPresenceAhead={50}>{INCIDENT_LABELS[incident.category]} | {formatDateTime(incident.occurredAt, timezone)}</Text>
        <Text style={styles.meta}>Children: {reportNames(incident.childIds, source.children)} | ID: {incident.id}</Text>
        <Text>Observed facts: {incident.observations}</Text>
        {incident.immediateActions && <Text>Immediate actions: {incident.immediateActions}</Text>}
        {incident.outcome && <Text>Outcome: {incident.outcome}</Text>}
        {source.attachments.filter((attachment) => attachment.recordType === "incident" && attachment.recordId === incident.id)
          .map((attachment) => <Text key={attachment.id}>Supporting file in evidence ZIP: {reportAttachmentPath(attachment)}</Text>)}
      </View>)}
      <Text style={styles.heading} minPresenceAhead={90}>Special days</Text>
      <Text style={styles.meta}>Saved plans and responsibility assignments only. These do not establish that planned care occurred.</Text>
      {source.arrangements.length === 0 ? <Text>No special days in this selection.</Text> : source.arrangements.map((day) => <View key={day.id} style={styles.row}>
        <Text style={styles.rowTitle} minPresenceAhead={50}>{day.localDate} | {day.title}</Text>
        {day.assignments.map((assignment) => <Text key={assignment.childId}>Planned responsibility: {reportNames([assignment.childId], source.children)} - {reportNames(assignment.caregiverIds, source.caregivers)}</Text>)}
        <Text>{day.tasks.length} planned tasks. Full plan details are in the workbook.</Text>
        {day.note && <Text>Context: {day.note}</Text>}
      </View>)}
      <View style={styles.footer} fixed><Text>{source.snapshot.id}</Text><Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} /></View>
    </Page>
  </Document>;
}
