import type {
  Appointment,
  Attachment,
  AuditEvent,
  CareEntry,
  DailyLog,
  DashboardData,
  Incident,
  IncidentsData,
  Member,
  PurgeTombstone,
  RecordRevision,
  RecordType,
  ReportSnapshot,
  SpecialArrangementDay,
  SpecialArrangementsData,
  SettingsData,
  TimelineData,
  Workspace,
} from "@/lib/domain/types";
import type {
  AppointmentInput,
  CareEntryCorrectionInput,
  CareEntryInput,
  CareEntryUpdateInput,
  CorrectionInput,
  DailyLogNotesInput,
  IncidentInput,
  ReportInput,
  WorkspaceSettingsInput,
  SpecialArrangementCorrectionInput,
  SpecialArrangementCreateInput,
  SpecialArrangementUpdateInput,
} from "@/lib/domain/schemas";
import type { Identity } from "@/lib/auth/identity";
import type {
  AgentConfirmation,
  AgentRequestAttribution,
} from "@/lib/agents/types";

export interface RequestContext {
  identity: Identity;
  workspace: Workspace;
  member: Member;
  billingOwnerAuthUserId: string;
  agent?: AgentRequestAttribution;
}

export interface RecordBundle {
  record: CareEntry | Appointment | Incident;
  revisions: RecordRevision[];
  attachments: Attachment[];
}

export type VersionedCareEntry = CareEntry & { recordVersion: string };
export type CareEntryWriteResult = VersionedCareEntry & {
  writeDisposition: "created" | "existing";
};
export type VersionedDailyLog = DailyLog & { dayVersion: string };

export interface ReportSource {
  snapshot: ReportSnapshot;
  workspace: Workspace;
  children: SettingsData["children"];
  caregivers: SettingsData["caregivers"];
  entries: CareEntry[];
  appointments: Appointment[];
  incidents: Incident[];
  arrangements: SpecialArrangementDay[];
  revisions: RecordRevision[];
  attachments: Attachment[];
}

export interface ParentingRepository {
  resolveContext(identity: Identity): Promise<RequestContext>;
  getAgentOperationResult<T>(
    context: RequestContext,
  ): Promise<{ found: true; result: T } | { found: false }>;
  getDashboard(
    context: RequestContext,
    date: string,
    createIfMissing?: boolean,
  ): Promise<DashboardData>;
  getTimeline(context: RequestContext): Promise<TimelineData>;
  getAppointments(context: RequestContext): Promise<Appointment[]>;
  getIncidents(context: RequestContext): Promise<Incident[]>;
  getIncidentsData(context: RequestContext): Promise<IncidentsData>;
  getReports(context: RequestContext): Promise<ReportSnapshot[]>;
  getSettings(context: RequestContext): Promise<SettingsData>;
  getSpecialArrangements(
    context: RequestContext,
  ): Promise<SpecialArrangementsData>;
  getRecordBundle(
    context: RequestContext,
    recordType: RecordType,
    recordId: string,
  ): Promise<RecordBundle | null>;
  getDayVersion(context: RequestContext, localDate: string): Promise<string>;
  createAgentConfirmation<T>(
    context: RequestContext,
    confirmation: AgentConfirmation,
    result: T,
  ): Promise<T>;
  getAgentConfirmation(
    context: RequestContext,
    tokenHash: string,
  ): Promise<AgentConfirmation | null>;
  getReportSource(
    context: RequestContext,
    reportId: string,
  ): Promise<ReportSource | null>;
  createCareEntry(
    context: RequestContext,
    input: CareEntryInput,
  ): Promise<CareEntryWriteResult>;
  updateCareEntry(
    context: RequestContext,
    input: CareEntryUpdateInput,
  ): Promise<VersionedCareEntry>;
  correctCareEntry(
    context: RequestContext,
    input: CareEntryCorrectionInput,
  ): Promise<RecordRevision>;
  createAppointment(
    context: RequestContext,
    input: AppointmentInput,
  ): Promise<Appointment>;
  createIncident(
    context: RequestContext,
    input: IncidentInput,
  ): Promise<Incident>;
  correctRecord(
    context: RequestContext,
    input: CorrectionInput,
  ): Promise<RecordRevision>;
  updateDailyLogNotes(
    context: RequestContext,
    input: DailyLogNotesInput,
  ): Promise<VersionedDailyLog>;
  finalizeDailyLog(
    context: RequestContext,
    localDate: string,
  ): Promise<VersionedDailyLog>;
  createSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementCreateInput,
  ): Promise<SpecialArrangementDay[]>;
  updateSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementUpdateInput,
  ): Promise<SpecialArrangementDay>;
  correctSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementCorrectionInput,
  ): Promise<RecordRevision>;
  createReport(
    context: RequestContext,
    input: ReportInput,
  ): Promise<ReportSnapshot>;
  markReportReady(
    context: RequestContext,
    reportId: string,
    artifacts: {
      manifestHash: string;
      pdfPathname: string;
      zipPathname: string;
      workflowRunId?: string;
    },
  ): Promise<void>;
  markReportFailed(
    context: RequestContext,
    reportId: string,
    error: string,
  ): Promise<void>;
  updateSettings(
    context: RequestContext,
    input: WorkspaceSettingsInput,
  ): Promise<SettingsData>;
  inviteReviewer(
    context: RequestContext,
    input: { email: string; displayName: string },
  ): Promise<Member>;
  revokeReviewer(context: RequestContext, memberId: string): Promise<void>;
  hardPurge(
    context: RequestContext,
    input: { recordType: RecordType; recordId: string; reason: string },
  ): Promise<PurgeTombstone>;
  addAttachment(context: RequestContext, attachment: Attachment): Promise<void>;
  getAttachment(
    context: RequestContext,
    attachmentId: string,
  ): Promise<Attachment | null>;
  recordAuditEvent(
    context: RequestContext,
    event: Omit<AuditEvent, "id" | "workspaceId" | "occurredAt" | "eventHash">,
  ): Promise<void>;
}
