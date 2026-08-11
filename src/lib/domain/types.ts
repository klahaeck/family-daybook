export type Role = "owner" | "reviewer";

export type CareStatus =
  | "completed"
  | "partial"
  | "missed"
  | "not_applicable";

export type CareTaskKey =
  | "wake_up"
  | "get_dressed"
  | "prepare_breakfast"
  | "prepare_lunch"
  | "school_dropoff"
  | "school_pickup"
  | "prepare_dinner"
  | "time_together"
  | "naptime"
  | "bedtime_pajamas"
  | "bedtime_teeth"
  | "bedtime_story"
  | "clean_spaces"
  | "custom";

export type AppointmentStatus =
  | "scheduled"
  | "attended"
  | "late"
  | "missed"
  | "cancelled"
  | "rescheduled";

export type IncidentCategory =
  | "safety_hazard"
  | "concerning_interaction"
  | "other";

export type RecordType = "care_entry" | "appointment" | "incident";
export type RevisionRecordType = RecordType | "special_arrangement";

export type ActionResult<T = undefined> = {
  ok: boolean;
  data?: T;
  fieldErrors?: Record<string, string[]>;
  error?: string;
};

export interface Workspace {
  id: string;
  name: string;
  timezone: string;
  ownerId: string;
  hardDeleteEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  demo: boolean;
}

export interface Member {
  id: string;
  workspaceId: string;
  authUserId?: string;
  email: string;
  displayName: string;
  role: Role;
  status: "active" | "invited" | "revoked";
  invitedAt?: string;
  lastAccessedAt?: string;
}

export interface Child {
  id: string;
  workspaceId: string;
  displayName: string;
  birthdate: string;
  color: "sage" | "blue" | "amber" | "violet";
  active: boolean;
  sortOrder: number;
}

export interface Caregiver {
  id: string;
  workspaceId: string;
  displayName: string;
  relationship: string;
  isOwner: boolean;
  active: boolean;
}

export interface RoutineTemplateItem {
  id: string;
  taskKey: CareTaskKey;
  label: string;
  childIds: string[];
  weekdays: number[];
  suggestedTime: string;
  sortOrder: number;
  active: boolean;
}

export interface RoutineTemplate {
  id: string;
  workspaceId: string;
  version: number;
  effectiveFrom: string;
  createdAt: string;
  items: RoutineTemplateItem[];
}

export interface DailyLog {
  id: string;
  workspaceId: string;
  localDate: string;
  templateVersion: number;
  status: "open" | "finalized";
  notes?: string;
  finalizedAt?: string;
  finalizedBy?: string;
}

export interface SpecialArrangementAssignment {
  childId: string;
  caregiverIds: string[];
}

export interface SpecialArrangementTask {
  id: string;
  sourceRoutineItemId?: string;
  taskKey: CareTaskKey;
  childId: string;
  label: string;
  suggestedTime: string;
  sortOrder: number;
}

export interface SpecialArrangementDay {
  id: string;
  workspaceId: string;
  seriesId: string;
  dailyLogId: string;
  localDate: string;
  title: string;
  note?: string;
  status: "active" | "cancelled";
  assignments: SpecialArrangementAssignment[];
  tasks: SpecialArrangementTask[];
  currentRevisionId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  dailyLogStatus?: DailyLog["status"];
}

export interface CareEntry {
  id: string;
  workspaceId: string;
  dailyLogId: string;
  templateItemId?: string;
  arrangementTaskId?: string;
  taskKey: CareTaskKey;
  taskLabel: string;
  childIds: string[];
  caregiverIds: string[];
  status: CareStatus;
  occurredAt: string;
  recordedAt: string;
  durationMinutes?: number;
  activityType?: string;
  notes?: string;
  currentRevisionId: string;
  createdBy: string;
  lateEntry: boolean;
}

export interface Appointment {
  id: string;
  workspaceId: string;
  childIds: string[];
  title: string;
  provider?: string;
  location?: string;
  scheduledAt: string;
  responsibleCaregiverIds: string[];
  status: AppointmentStatus;
  arrivedAt?: string;
  cancellationDetails?: string;
  notes?: string;
  recordedAt: string;
  currentRevisionId: string;
  createdBy: string;
}

export interface Incident {
  id: string;
  workspaceId: string;
  category: IncidentCategory;
  occurredAt: string;
  discoveredAt?: string;
  location?: string;
  childIds: string[];
  peoplePresent: string[];
  witnesses: string[];
  observations: string;
  exactQuotes?: string;
  immediateActions?: string;
  outcome?: string;
  recordedAt: string;
  currentRevisionId: string;
  createdBy: string;
}

export interface RecordRevision {
  id: string;
  workspaceId: string;
  recordType: RevisionRecordType;
  recordId: string;
  previousRevisionId?: string;
  revisionNumber: number;
  payload: Record<string, unknown>;
  reason: string;
  authorId: string;
  recordedAt: string;
  hash: string;
}

export interface Attachment {
  id: string;
  workspaceId: string;
  recordType: RecordType;
  recordId: string;
  revisionId: string;
  originalName: string;
  contentType: "image/jpeg" | "image/png" | "image/heic" | "application/pdf";
  size: number;
  sha256: string;
  pathname: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  actorId: string;
  action:
    | "created"
    | "updated"
    | "corrected"
    | "finalized"
    | "invited"
    | "revoked"
    | "report_generated"
    | "downloaded"
    | "purged"
    | "settings_changed";
  targetType: string;
  targetId: string;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean>;
  previousHash?: string;
  eventHash: string;
}

export interface ReportFilters {
  from: string;
  to: string;
  childIds: string[];
  includeCare: boolean;
  includeAppointments: boolean;
  includeIncidents: boolean;
}

export interface ReportSnapshot {
  id: string;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
  status: "pending" | "ready" | "failed";
  filters: ReportFilters;
  recordRevisionIds: string[];
  attachmentIds: string[];
  manifestHash?: string;
  pdfPathname?: string;
  zipPathname?: string;
  workflowRunId?: string;
  error?: string;
}

export interface PurgeTombstone {
  id: string;
  workspaceId: string;
  recordType: RecordType;
  recordId: string;
  priorHashes: string[];
  reason: string;
  purgedBy: string;
  purgedAt: string;
}

export interface TodayTask {
  id: string;
  source: "routine" | "special_arrangement";
  templateItemId?: string;
  arrangementTaskId?: string;
  taskKey: CareTaskKey;
  label: string;
  childIds: string[];
  weekdays: number[];
  suggestedTime: string;
  sortOrder: number;
  active: boolean;
  plannedCaregiverIds: string[];
  entry?: CareEntry;
}

export interface DashboardData {
  workspace: Workspace;
  member: Member;
  date: string;
  dailyLog: DailyLog;
  children: Child[];
  caregivers: Caregiver[];
  tasks: TodayTask[];
  specialArrangement?: SpecialArrangementDay;
  completion: { recorded: number; total: number; percent: number };
  recentEntries: CareEntry[];
}

export interface TimelineItem {
  id: string;
  kind: "care" | "appointment" | "incident" | "special_day";
  occurredAt: string;
  recordedAt: string;
  localDate?: string;
  title: string;
  description?: string;
  childIds: string[];
  caregiverIds: string[];
  status: string;
  lateEntry?: boolean;
  dailyLogStatus?: DailyLog["status"];
  currentRevisionId: string;
}

export interface TimelineData {
  workspace: Workspace;
  children: Child[];
  caregivers: Caregiver[];
  items: TimelineItem[];
  attachments: Attachment[];
  revisions: RecordRevision[];
}

export interface SettingsData {
  workspace: Workspace;
  members: Member[];
  children: Child[];
  caregivers: Caregiver[];
  template: RoutineTemplate;
}

export interface SpecialArrangementsData {
  workspace: Workspace;
  children: Child[];
  caregivers: Caregiver[];
  template: RoutineTemplate;
  days: SpecialArrangementDay[];
}
