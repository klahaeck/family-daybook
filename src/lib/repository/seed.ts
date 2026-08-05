import { CARE_TASKS } from "@/lib/domain/constants";
import {
  createAuditHash,
  createRevisionHash,
  id,
  sha256,
} from "@/lib/domain/integrity";
import { localDateInTimezone } from "@/lib/domain/dates";
import type {
  Appointment,
  Attachment,
  AuditEvent,
  CareEntry,
  Caregiver,
  Child,
  DailyLog,
  Incident,
  Member,
  PurgeTombstone,
  RecordRevision,
  ReportSnapshot,
  RoutineTemplate,
  SpecialArrangementDay,
  Workspace,
} from "@/lib/domain/types";

export interface ParentingState {
  workspace: Workspace;
  members: Member[];
  children: Child[];
  caregivers: Caregiver[];
  templates: RoutineTemplate[];
  dailyLogs: DailyLog[];
  specialArrangements: SpecialArrangementDay[];
  careEntries: CareEntry[];
  appointments: Appointment[];
  incidents: Incident[];
  revisions: RecordRevision[];
  attachments: Attachment[];
  auditEvents: AuditEvent[];
  reports: ReportSnapshot[];
  tombstones: PurgeTombstone[];
}

function createSeedRevision(
  recordType: "care_entry",
  recordId: string,
  payload: Record<string, unknown>,
  recordedAt: string,
  workspaceId: string,
  authorId: string,
): RecordRevision {
  return {
    id: id("rev"),
    workspaceId,
    recordType,
    recordId,
    revisionNumber: 1,
    payload,
    reason: "Initial record",
    authorId,
    recordedAt,
    hash: createRevisionHash({ payload, authorId, recordedAt }),
  };
}

export interface SeedIdentity {
  authUserId: string;
  email: string;
  displayName: string;
}

export function createSeedState(
  demo = true,
  identity?: SeedIdentity,
): ParentingState {
  const now = new Date();
  const nowIso = now.toISOString();
  const timezone = "America/Chicago";
  const localDate = localDateInTimezone(now, timezone);
  const identityKey = identity
    ? sha256(identity.authUserId).slice(0, 32)
    : undefined;
  const workspaceId = identityKey
    ? `workspace_${identityKey}`
    : "workspace_local";
  const ownerId = identityKey ? `member_${identityKey}` : "member_owner";
  const childId = identityKey ? `child_${identityKey}` : "child_one";
  const ownerCaregiverId = identityKey
    ? `caregiver_owner_${identityKey}`
    : "caregiver_owner";
  const otherCaregiverId = identityKey
    ? `caregiver_other_${identityKey}`
    : "caregiver_other";
  const templateId = identityKey
    ? `template_${identityKey}_v1`
    : "template_v1";

  const workspace: Workspace = {
    id: workspaceId,
    name: demo ? "Sample family workspace" : "My family workspace",
    timezone,
    ownerId,
    hardDeleteEnabled: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    demo,
  };

  const members: Member[] = [
    {
      id: ownerId,
      workspaceId: workspace.id,
      authUserId: identity?.authUserId ?? "demo_owner",
      email: identity?.email.toLowerCase() ?? "owner@example.local",
      displayName:
        identity?.displayName ?? (demo ? "Demo owner" : "Owner"),
      role: "owner",
      status: "active",
    },
  ];

  const children: Child[] = [
    {
      id: childId,
      workspaceId: workspace.id,
      displayName: "Child One",
      birthdate: demo ? "2018-01-01" : localDate,
      color: "sage",
      active: true,
      sortOrder: 1,
    },
  ];

  const caregivers: Caregiver[] = [
    {
      id: ownerCaregiverId,
      workspaceId: workspace.id,
      displayName: "Parent A",
      relationship: "Parent",
      isOwner: true,
      active: true,
    },
    {
      id: otherCaregiverId,
      workspaceId: workspace.id,
      displayName: "Parent B",
      relationship: "Parent",
      isOwner: false,
      active: true,
    },
  ];

  const template: RoutineTemplate = {
    id: templateId,
    workspaceId: workspace.id,
    version: 1,
    effectiveFrom: localDate,
    createdAt: nowIso,
    items: CARE_TASKS.map((task, index) => ({
      id: identityKey
        ? `routine_${identityKey}_${task.key}`
        : `routine_${task.key}`,
      taskKey: task.key,
      label: task.label,
      childIds: children.map((child) => child.id),
      weekdays: task.key.includes("school") ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
      suggestedTime: task.suggestedTime,
      sortOrder: index + 1,
      active: true,
    })),
  };

  const dailyLog: DailyLog = {
    id: identityKey
      ? `daily_${identityKey}_${localDate}`
      : `daily_${localDate}`,
    workspaceId: workspace.id,
    localDate,
    templateVersion: 1,
    status: "open",
  };

  const careEntries: CareEntry[] = [];
  const revisions: RecordRevision[] = [];

  if (demo) {
    const examples = [
      {
        item: template.items[0],
        minutesAgo: 150,
        children: children.map((child) => child.id),
      },
      {
        item: template.items[2],
        minutesAgo: 120,
        children: children.map((child) => child.id),
      },
      {
        item: template.items[4],
        minutesAgo: 75,
        children: [children[0].id],
      },
    ];

    for (const example of examples) {
      const recordId = id("care");
      const occurredAt = new Date(now.getTime() - example.minutesAgo * 60_000).toISOString();
      const payload = {
        taskKey: example.item.taskKey,
        taskLabel: example.item.label,
        childIds: example.children,
        caregiverIds: [caregivers[0].id],
        status: "completed",
        occurredAt,
        notes: "Sample record — replace this workspace before real use.",
      };
      const revision = createSeedRevision(
        "care_entry",
        recordId,
        payload,
        nowIso,
        workspace.id,
        members[0].id,
      );
      revisions.push(revision);
      careEntries.push({
        id: recordId,
        workspaceId: workspace.id,
        dailyLogId: dailyLog.id,
        templateItemId: example.item.id,
        taskKey: example.item.taskKey,
        taskLabel: example.item.label,
        childIds: example.children,
        caregiverIds: [caregivers[0].id],
        status: "completed",
        occurredAt,
        recordedAt: nowIso,
        notes: "Sample record — replace this workspace before real use.",
        currentRevisionId: revision.id,
        createdBy: members[0].id,
        lateEntry: false,
      });
    }
  }

  const initialAudit = {
    actorId: members[0].id,
    action: "created" as const,
    targetType: "workspace",
    targetId: workspace.id,
    metadata: { demo },
  };
  const auditEvents: AuditEvent[] = [
    {
      id: id("audit"),
      workspaceId: workspace.id,
      ...initialAudit,
      occurredAt: nowIso,
      eventHash: createAuditHash({ event: { ...initialAudit, occurredAt: nowIso } }),
    },
  ];

  return {
    workspace,
    members,
    children,
    caregivers,
    templates: [template],
    dailyLogs: [dailyLog],
    specialArrangements: [],
    careEntries,
    appointments: [],
    incidents: [],
    revisions,
    attachments: [],
    auditEvents,
    reports: [],
    tombstones: [],
  };
}
