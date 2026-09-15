import "server-only";

import { assertValidCareEntryDetails } from "@/lib/domain/care-entry-rules";
import {
  lateEntryFor,
  localDateInTimezone,
  weekdayForLocalDate,
} from "@/lib/domain/dates";
import {
  canonicalJson,
  createAuditHash,
  createRevisionHash,
  id,
  sha256,
} from "@/lib/domain/integrity";
import type {
  Appointment,
  Attachment,
  AuditEvent,
  CareEntry,
  DailyLog,
  Incident,
  IncidentsData,
  Member,
  PurgeTombstone,
  RecordRevision,
  RecordType,
  RevisionRecordType,
  ReportEvidenceSnapshot,
  ReportSnapshot,
  SpecialArrangementDay,
  SettingsData,
  TodayTask,
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
  SpecialArrangementCorrectionInput,
  SpecialArrangementCreateInput,
  SpecialArrangementUpdateInput,
  WorkspaceSettingsInput,
} from "@/lib/domain/schemas";
import { createSeedState, type ParentingState } from "./seed";
import {
  arrangementForChildren,
  assertActiveReferenceIds,
  assertReportRevisionCoverage,
  createNextRoutineItems,
  dayVersionFor,
  recordPayload,
  requireOwner,
  toTimelineItems,
  withCurrentLateEntryStatus,
} from "./helpers";
import { reportArtifactPathnames } from "@/lib/reporting/artifact-paths";
import type {
  CareEntryWriteResult,
  ParentingRepository,
  RecordBundle,
  ReportSource,
  RequestContext,
  VersionedCareEntry,
  VersionedDailyLog,
  VersionedSpecialArrangement,
} from "./repository";
import type { Identity } from "@/lib/auth/identity";
import type {
  AgentConfirmation,
  AgentOperationReceipt,
} from "@/lib/agents/types";

declare global {
  var __parentingLogState: ParentingState | undefined;
}

function state(): ParentingState {
  globalThis.__parentingLogState ??= createSeedState(true);
  return globalThis.__parentingLogState;
}

function latestTemplate(data: ParentingState) {
  return [...data.templates].sort((a, b) => b.version - a.version)[0];
}

function ensureDailyLog(data: ParentingState, date: string): DailyLog {
  const existing = data.dailyLogs.find((log) => log.localDate === date);
  const latestVersion = latestTemplate(data).version;
  if (existing) {
    const hasEntries = data.careEntries.some((entry) => entry.dailyLogId === existing.id);
    if (existing.status === "open" && !hasEntries) {
      existing.templateVersion = latestVersion;
    }
    return existing;
  }
  const created: DailyLog = {
    id: id("daily"),
    workspaceId: data.workspace.id,
    localDate: date,
    templateVersion: latestVersion,
    status: "open",
  };
  data.dailyLogs.push(created);
  return created;
}

function dayVersionForState(data: ParentingState, log: DailyLog): string {
  const specialArrangement = data.specialArrangements.find(
    (arrangement) =>
      arrangement.dailyLogId === log.id && arrangement.status === "active",
  );
  return dayVersionFor(
    log,
    data.careEntries,
    data.revisions,
    specialArrangement,
  );
}

function findRecord(data: ParentingState, type: RecordType, recordId: string) {
  if (type === "care_entry")
    return data.careEntries.find((item) => item.id === recordId);
  if (type === "appointment")
    return data.appointments.find((item) => item.id === recordId);
  return data.incidents.find((item) => item.id === recordId);
}

function arrangementPayload(
  arrangement: Pick<
    SpecialArrangementDay,
    | "localDate"
    | "title"
    | "note"
    | "status"
    | "assignments"
    | "tasks"
    | "updatedAt"
  >,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(arrangement)) as Record<string, unknown>;
}

function normalizeArrangementFields(
  data: ParentingState,
  input: Pick<
    SpecialArrangementUpdateInput,
    "title" | "note" | "status" | "assignments" | "tasks"
  >,
  current?: SpecialArrangementDay,
) {
  const activeChildren = data.children.filter((child) => child.active);
  const activeChildIds = new Set(activeChildren.map((child) => child.id));
  const assignmentIds = new Set(input.assignments.map((assignment) => assignment.childId));
  if (
    input.assignments.length !== activeChildIds.size ||
    assignmentIds.size !== activeChildIds.size ||
    [...activeChildIds].some((childId) => !assignmentIds.has(childId))
  ) {
    throw new Error("INVALID_ARRANGEMENT_CHILDREN");
  }
  const activeCaregiverIds = new Set(
    data.caregivers.filter((caregiver) => caregiver.active).map((caregiver) => caregiver.id),
  );
  if (
    input.assignments.some((assignment) =>
      assignment.caregiverIds.length === 0 ||
      new Set(assignment.caregiverIds).size !== assignment.caregiverIds.length ||
      assignment.caregiverIds.some(
        (caregiverId) => !activeCaregiverIds.has(caregiverId),
      ),
    )
  ) {
    throw new Error("INVALID_ARRANGEMENT_CAREGIVER");
  }
  const routineIds = new Set(
    data.templates.flatMap((template) => template.items.map((item) => item.id)),
  );
  const currentTaskIds = new Set(current?.tasks.map((task) => task.id) ?? []);
  const submittedTaskIds = new Set<string>();
  const tasks = input.tasks.map((task, index) => {
    if (!activeChildIds.has(task.childId)) {
      throw new Error("INVALID_ARRANGEMENT_TASK");
    }
    if (task.sourceRoutineItemId && !routineIds.has(task.sourceRoutineItemId)) {
      throw new Error("INVALID_ROUTINE_ITEM");
    }
    if (task.id && (!currentTaskIds.has(task.id) || submittedTaskIds.has(task.id))) {
      throw new Error("INVALID_ARRANGEMENT_TASK");
    }
    const taskId = task.id ?? id("arrangement_task");
    submittedTaskIds.add(taskId);
    return {
      id: taskId,
      sourceRoutineItemId: task.sourceRoutineItemId,
      taskKey: task.taskKey,
      childId: task.childId,
      label: task.label,
      suggestedTime: task.suggestedTime,
      sortOrder: index + 1,
    };
  });
  return {
    title: input.title,
    note: input.note || undefined,
    status: input.status,
    assignments: input.assignments.map((assignment) => ({
      childId: assignment.childId,
      caregiverIds: [...assignment.caregiverIds],
    })),
    tasks,
  };
}

export class MemoryParentingRepository implements ParentingRepository {
  async resolveContext(
    identity: Identity,
    _options: { allowAccountDeletion?: boolean } = {},
  ): Promise<RequestContext> {
    void _options;
    const data = state();
    const matchingMember = data.members.find(
      (item) =>
        item.authUserId === identity.authUserId ||
        item.email.toLowerCase() === identity.email.toLowerCase(),
    );
    if (matchingMember?.status === "revoked") throw new Error("FORBIDDEN");
    const member =
      (matchingMember?.status === "active" ? matchingMember : undefined) ??
      (identity.demo
        ? data.members.find(
            (item) => item.role === "owner" && item.status === "active",
          )
        : undefined);
    if (!member) throw new Error("FORBIDDEN");
    const owner = data.members.find(
      (item) => item.id === data.workspace.ownerId && item.status === "active",
    );
    if (!owner?.authUserId) throw new Error("BILLING_OWNER_REQUIRED");
    return {
      identity,
      workspace: data.workspace,
      member,
      billingOwnerAuthUserId: owner.authUserId,
    };
  }

  async getOperationResult<T>(context: RequestContext) {
    return this.operationReplay<T>(context);
  }

  async recordOperationResult<T>(context: RequestContext, result: T): Promise<T> {
    const replay = this.operationReplay<T>(context);
    if (replay.found) return replay.result;
    this.recordOperation(context, result);
    return result;
  }

  async getDashboard(
    context: RequestContext,
    date: string,
    createIfMissing = true,
  ) {
    const data = state();
    const dailyLog =
      context.member.role === "reviewer"
        ? data.dailyLogs.find(
            (log) => log.localDate === date && log.status === "finalized",
          )
        : createIfMissing
          ? ensureDailyLog(data, date)
          : data.dailyLogs.find((log) => log.localDate === date);
    if (!dailyLog) throw new Error("NOT_FOUND");
    const entries = data.careEntries.map((entry) =>
      withCurrentLateEntryStatus(entry, context.workspace.timezone),
    );
    const template =
      data.templates.find((item) => item.version === dailyLog.templateVersion) ??
      latestTemplate(data);
    const weekday = weekdayForLocalDate(date);
    const dayEntries = entries.filter((entry) => entry.dailyLogId === dailyLog.id);
    const specialArrangement = data.specialArrangements.find(
      (arrangement) =>
        arrangement.dailyLogId === dailyLog.id && arrangement.status === "active",
    );
    const tasks: TodayTask[] = specialArrangement
      ? specialArrangement.tasks.map((task) => ({
          id: task.id,
          source: "special_arrangement",
          arrangementTaskId: task.id,
          taskKey: task.taskKey,
          label: task.label,
          childIds: [task.childId],
          weekdays: [weekday],
          suggestedTime: task.suggestedTime,
          sortOrder: task.sortOrder,
          active: true,
          plannedCaregiverIds:
            specialArrangement.assignments.find(
              (assignment) => assignment.childId === task.childId,
            )?.caregiverIds ?? [],
          entry: dayEntries.find((entry) => entry.arrangementTaskId === task.id),
        }))
      : template.items
          .filter((item) => item.active && item.weekdays.includes(weekday))
          .map((item) => ({
            ...item,
            source: "routine" as const,
            templateItemId: item.id,
            plannedCaregiverIds: [],
            entry: dayEntries.find((entry) => entry.templateItemId === item.id),
          }));
    const recorded = tasks.filter((task) => Boolean(task.entry)).length;

    return {
      workspace: context.workspace,
      member: context.member,
      date,
      dailyLog,
      children: data.children.filter((child) => child.active),
      caregivers: data.caregivers.filter((caregiver) => caregiver.active),
      tasks,
      specialArrangement,
      completion: {
        recorded,
        total: tasks.length,
        percent: tasks.length ? Math.round((recorded / tasks.length) * 100) : 0,
      },
      recentEntries: dayEntries
        .sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        ),
    };
  }

  async getTimeline(context: RequestContext) {
    const data = state();
    const visibleEntries =
      context.member.role === "reviewer"
        ? data.careEntries.filter((entry) =>
            data.dailyLogs.some(
              (log) => log.id === entry.dailyLogId && log.status === "finalized",
            ),
          )
        : data.careEntries;
    const visibleArrangements =
      context.member.role === "reviewer"
        ? data.specialArrangements.filter((arrangement) =>
            data.dailyLogs.some(
              (log) =>
                log.id === arrangement.dailyLogId &&
                log.status === "finalized",
            ),
          )
        : data.specialArrangements;
    const visibleRecordIds = new Set([
      ...visibleEntries.map((entry) => entry.id),
      ...data.appointments.map((appointment) => appointment.id),
      ...data.incidents.map((incident) => incident.id),
      ...visibleArrangements.map((arrangement) => arrangement.id),
    ]);
    return {
      workspace: context.workspace,
      children: data.children,
      caregivers: data.caregivers.filter((caregiver) => caregiver.active),
      items: toTimelineItems({
        entries: visibleEntries,
        appointments: data.appointments,
        incidents: data.incidents,
        arrangements: visibleArrangements,
        dailyLogs: data.dailyLogs,
        timezone: context.workspace.timezone,
      }),
      attachments: data.attachments.filter((attachment) =>
        visibleRecordIds.has(attachment.recordId),
      ),
      revisions: data.revisions.filter((revision) =>
        visibleRecordIds.has(revision.recordId),
      ),
    };
  }

  async getAppointments() {
    return [...state().appointments].sort(
      (a, b) =>
        new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
    );
  }

  async getIncidents() {
    return [...state().incidents].sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  }

  async getIncidentsData(context: RequestContext): Promise<IncidentsData> {
    return {
      incidents: await this.getIncidents(),
      attachments: state().attachments
        .filter(
          (attachment) =>
            attachment.workspaceId === context.workspace.id &&
            attachment.recordType === "incident",
        )
        .sort(
          (a, b) =>
            new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
        ),
    };
  }

  async getReports() {
    return [...state().reports].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async getSettings(context: RequestContext): Promise<SettingsData> {
    const data = state();
    return {
      workspace: context.workspace,
      members: data.members,
      children: data.children.filter((child) => child.active),
      caregivers: data.caregivers,
      template: latestTemplate(data),
    };
  }

  async getSpecialArrangements(context: RequestContext) {
    requireOwner(context.member.role);
    const data = state();
    return {
      workspace: context.workspace,
      children: data.children.filter((child) => child.active),
      caregivers: data.caregivers.filter((caregiver) => caregiver.active),
      template: latestTemplate(data),
      days: [...data.specialArrangements]
        .sort((a, b) => b.localDate.localeCompare(a.localDate))
        .map((arrangement) => ({
          ...arrangement,
          dailyLogStatus: data.dailyLogs.find(
            (log) => log.id === arrangement.dailyLogId,
          )?.status,
        })),
    };
  }

  async getSpecialArrangement(
    context: RequestContext,
    recordId: string,
  ): Promise<VersionedSpecialArrangement | null> {
    requireOwner(context.member.role);
    const data = state();
    const arrangement = data.specialArrangements.find(
      (item) =>
        item.id === recordId && item.workspaceId === context.workspace.id,
    );
    if (!arrangement) return null;
    const revision = data.revisions.find(
      (item) => item.id === arrangement.currentRevisionId,
    );
    if (!revision) throw new Error("REVISION_NOT_FOUND");
    return { ...arrangement, recordVersion: revision.hash };
  }

  async getRecordBundle(
    context: RequestContext,
    recordType: RecordType,
    recordId: string,
  ): Promise<RecordBundle | null> {
    const data = state();
    const record = findRecord(data, recordType, recordId);
    if (!record) return null;
    if (
      context.member.role === "reviewer" &&
      recordType === "care_entry" &&
      !data.dailyLogs.some(
        (log) => log.id === (record as CareEntry).dailyLogId && log.status === "finalized",
      )
    ) {
      return null;
    }
    return {
      record:
        recordType === "care_entry"
          ? withCurrentLateEntryStatus(
              record as CareEntry,
              context.workspace.timezone,
            )
          : record,
      revisions: data.revisions
        .filter(
          (revision) =>
            revision.recordType === recordType && revision.recordId === recordId,
        )
        .sort((a, b) => a.revisionNumber - b.revisionNumber),
      attachments: data.attachments.filter(
        (attachment) =>
          attachment.recordType === recordType && attachment.recordId === recordId,
      ),
    };
  }

  async getDayVersion(context: RequestContext, localDate: string) {
    const data = state();
    const log = data.dailyLogs.find(
      (item) =>
        item.workspaceId === context.workspace.id && item.localDate === localDate,
    );
    if (!log) throw new Error("NOT_FOUND");
    if (context.member.role === "reviewer" && log.status !== "finalized") {
      throw new Error("NOT_FOUND");
    }
    return dayVersionForState(data, log);
  }

  async createAgentConfirmation<T>(
    context: RequestContext,
    confirmation: AgentConfirmation,
    result: T,
  ): Promise<T> {
    requireOwner(context.member.role);
    if (
      confirmation.workspaceId !== context.workspace.id ||
      confirmation.memberId !== context.member.id ||
      confirmation.oauthClientId !== context.agent?.oauthClientId
    ) {
      throw new Error("FORBIDDEN");
    }
    const replay = this.operationReplay<T>(context);
    if (replay.found) return result;
    state().agentConfirmations.push(confirmation);
    this.recordOperation(context, this.redactConfirmationHandle(result));
    return result;
  }

  async getAgentConfirmation(context: RequestContext, tokenHash: string) {
    return (
      state().agentConfirmations.find(
        (item) =>
          item.tokenHash === tokenHash &&
          item.workspaceId === context.workspace.id &&
          item.memberId === context.member.id &&
          item.oauthClientId === context.agent?.oauthClientId,
      ) ?? null
    );
  }

  async getReportSource(
    context: RequestContext,
    reportId: string,
  ): Promise<ReportSource | null> {
    const data = state();
    const snapshot = data.reports.find(
      (report) =>
        report.id === reportId && report.workspaceId === context.workspace.id,
    );
    const evidence = data.reportEvidenceSnapshots.find(
      (item) =>
        item.reportId === reportId &&
        item.workspaceId === context.workspace.id,
    );
    if (!snapshot || !evidence) return null;
    const captured = structuredClone(evidence);
    return {
      snapshot: structuredClone(snapshot),
      workspace: captured.workspace,
      children: captured.children,
      caregivers: captured.caregivers,
      entries: captured.entries,
      appointments: captured.appointments,
      incidents: captured.incidents,
      arrangements: captured.arrangements,
      revisions: captured.revisions,
      attachments: captured.attachments,
    };
  }

  async createCareEntry(context: RequestContext, input: CareEntryInput) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<CareEntryWriteResult>(context);
    if (replay.found) return replay.result;
    const data = state();
    const recordedAt = new Date().toISOString();
    const dailyLog = ensureDailyLog(data, input.localDate);
    if (dailyLog.status !== "open") throw new Error("DAY_FINALIZED");
    if (input.templateItemId && input.arrangementTaskId) {
      throw new Error("INVALID_CARE_TASK");
    }
    const arrangementTask = input.arrangementTaskId
      ? data.specialArrangements
          .find(
            (arrangement) =>
              arrangement.dailyLogId === dailyLog.id && arrangement.status === "active",
          )
          ?.tasks.find((task) => task.id === input.arrangementTaskId)
      : undefined;
    if (input.arrangementTaskId && !arrangementTask) {
      throw new Error("INVALID_ARRANGEMENT_TASK");
    }
    const normalizedInput = arrangementTask
      ? {
          ...input,
          taskKey: arrangementTask.taskKey,
          taskLabel: arrangementTask.label,
        }
      : input;
    assertValidCareEntryDetails(normalizedInput);
    if (normalizedInput.templateItemId) {
      const existing = data.careEntries.find(
        (entry) =>
          entry.dailyLogId === dailyLog.id &&
          entry.templateItemId === normalizedInput.templateItemId,
      );
      if (existing) {
        const revision = data.revisions.find(
          (item) => item.id === existing.currentRevisionId,
        );
        if (!revision) throw new Error("REVISION_NOT_FOUND");
        const result: CareEntryWriteResult = {
          ...existing,
          recordVersion: revision.hash,
          writeDisposition: "existing",
        };
        this.recordOperation(context, result);
        return result;
      }
    }
    const recordId = id("care");
    const payload: Record<string, unknown> = { ...normalizedInput };
    for (const field of ["durationMinutes", "activityType", "notes"] as const) {
      if (normalizedInput[field] === undefined) delete payload[field];
    }
    const revision = this.createRevision(
      data,
      "care_entry",
      recordId,
      payload,
      context.member.id,
      recordedAt,
    );
    const entry: CareEntry = {
      id: recordId,
      workspaceId: data.workspace.id,
      dailyLogId: dailyLog.id,
      templateItemId: normalizedInput.templateItemId,
      arrangementTaskId: normalizedInput.arrangementTaskId,
      taskKey: normalizedInput.taskKey,
      taskLabel: normalizedInput.taskLabel,
      childIds: normalizedInput.childIds,
      caregiverIds: normalizedInput.caregiverIds,
      status: normalizedInput.status,
      occurredAt: new Date(normalizedInput.occurredAt).toISOString(),
      recordedAt,
      durationMinutes: normalizedInput.durationMinutes,
      activityType: normalizedInput.activityType,
      notes: normalizedInput.notes,
      currentRevisionId: revision.id,
      createdBy: context.member.id,
      lateEntry: lateEntryFor(
        normalizedInput.occurredAt,
        recordedAt,
        context.workspace.timezone,
      ),
    };
    for (const field of ["durationMinutes", "activityType", "notes"] as const) {
      if (entry[field] === undefined) delete entry[field];
    }
    data.careEntries.push(entry);
    await this.audit(context, "created", "care_entry", entry.id);
    const result: CareEntryWriteResult = {
      ...entry,
      recordVersion: revision.hash,
      writeDisposition: "created",
    };
    this.recordOperation(context, result);
    return result;
  }

  async updateCareEntry(context: RequestContext, input: CareEntryUpdateInput) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<VersionedCareEntry>(context);
    if (replay.found) return replay.result;
    assertValidCareEntryDetails(input);
    const data = state();
    const entry = data.careEntries.find((item) => item.id === input.recordId);
    if (!entry) throw new Error("NOT_FOUND");
    const dailyLog = data.dailyLogs.find((log) => log.id === entry.dailyLogId);
    if (!dailyLog) throw new Error("NOT_FOUND");
    if (dailyLog.status !== "open") throw new Error("DAY_FINALIZED");
    const revision = data.revisions.find(
      (item) => item.id === entry.currentRevisionId,
    );
    if (!revision) throw new Error("REVISION_NOT_FOUND");
    if (
      context.operation?.expectedRecordVersion &&
      context.operation.expectedRecordVersion !== revision.hash
    ) {
      throw new Error("VERSION_CONFLICT");
    }
    const previousRevision = revision.previousRevisionId
      ? data.revisions.find((item) => item.id === revision.previousRevisionId)
      : undefined;
    if (revision.previousRevisionId && !previousRevision) {
      throw new Error("REVISION_NOT_FOUND");
    }

    const savedAt = new Date().toISOString();
    const occurredAt = new Date(input.occurredAt).toISOString();
    const update = {
      childIds: input.childIds,
      caregiverIds: input.caregiverIds,
      status: input.status,
      durationMinutes: input.durationMinutes,
      activityType: input.activityType,
      notes: input.notes,
    };
    const payload = { ...revision.payload, ...update, occurredAt };
    for (const field of ["durationMinutes", "activityType", "notes"] as const) {
      if (update[field] === undefined) delete payload[field];
    }

    Object.assign(revision, {
      payload,
      authorId: context.member.id,
      recordedAt: savedAt,
      hash: createRevisionHash({
        payload,
        previousHash: previousRevision?.hash,
        authorId: context.member.id,
        recordedAt: savedAt,
      }),
    });
    Object.assign(entry, update, {
      occurredAt,
      lateEntry: lateEntryFor(
        occurredAt,
        entry.recordedAt,
        context.workspace.timezone,
      ),
    });
    await this.audit(context, "updated", "care_entry", entry.id, {
      revisionNumber: revision.revisionNumber,
    });
    const result = { ...entry, recordVersion: revision.hash };
    this.recordOperation(context, result);
    return result;
  }

  async correctCareEntry(context: RequestContext, input: CareEntryCorrectionInput) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<RecordRevision>(context);
    if (replay.found) return replay.result;
    assertValidCareEntryDetails(input);
    const data = state();
    const entry = data.careEntries.find((item) => item.id === input.recordId);
    if (!entry) throw new Error("NOT_FOUND");
    const dailyLog = data.dailyLogs.find((log) => log.id === entry.dailyLogId);
    if (!dailyLog) throw new Error("NOT_FOUND");
    if (dailyLog.status !== "finalized") throw new Error("DAY_NOT_FINALIZED");
    const previous = data.revisions.find(
      (revision) => revision.id === entry.currentRevisionId,
    );
    if (!previous) throw new Error("REVISION_NOT_FOUND");
    if (
      context.operation?.expectedRecordVersion &&
      context.operation.expectedRecordVersion !== previous.hash
    ) {
      throw new Error("CONFIRMATION_STALE");
    }
    this.assertAndConsumeConfirmation(context, entry.id, previous.hash);

    const recordedAt = new Date().toISOString();
    const occurredAt = new Date(input.occurredAt).toISOString();
    const { reason } = input;
    const correction = {
      childIds: input.childIds,
      caregiverIds: input.caregiverIds,
      status: input.status,
      durationMinutes: input.durationMinutes,
      activityType: input.activityType,
      notes: input.notes,
    };
    const payload = { ...recordPayload(entry), ...correction, occurredAt };
    for (const field of ["durationMinutes", "activityType", "notes"] as const) {
      if (correction[field] === undefined) delete payload[field];
    }
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: data.workspace.id,
      recordType: "care_entry",
      recordId: entry.id,
      previousRevisionId: previous.id,
      revisionNumber: previous.revisionNumber + 1,
      payload,
      reason,
      authorId: context.member.id,
      recordedAt,
      hash: createRevisionHash({
        payload,
        previousHash: previous.hash,
        authorId: context.member.id,
        recordedAt,
      }),
    };

    data.revisions.push(revision);
    Object.assign(entry, correction, {
      occurredAt,
      currentRevisionId: revision.id,
      lateEntry: lateEntryFor(
        occurredAt,
        entry.recordedAt,
        context.workspace.timezone,
      ),
    });
    await this.audit(
      context,
      "corrected",
      "care_entry",
      entry.id,
      { revisionNumber: revision.revisionNumber },
      previous.hash,
    );
    this.recordOperation(context, revision);
    return revision;
  }

  async createAppointment(context: RequestContext, input: AppointmentInput) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<Appointment>(context);
    if (replay.found) return replay.result;
    const data = state();
    assertActiveReferenceIds(
      input.childIds,
      new Set(
        data.children
          .filter(
            (child) =>
              child.workspaceId === context.workspace.id && child.active,
          )
          .map((child) => child.id),
      ),
      "INVALID_CHILD_REFERENCE",
    );
    assertActiveReferenceIds(
      input.responsibleCaregiverIds,
      new Set(
        data.caregivers
          .filter(
            (caregiver) =>
              caregiver.workspaceId === context.workspace.id &&
              caregiver.active,
          )
          .map((caregiver) => caregiver.id),
      ),
      "INVALID_CAREGIVER_REFERENCE",
    );
    const recordedAt = new Date().toISOString();
    const recordId = id("appointment");
    const payload: Record<string, unknown> = { ...input };
    const revision = this.createRevision(
      data,
      "appointment",
      recordId,
      payload,
      context.member.id,
      recordedAt,
    );
    const appointment: Appointment = {
      id: recordId,
      workspaceId: data.workspace.id,
      ...input,
      arrivedAt: input.arrivedAt || undefined,
      scheduledAt: new Date(input.scheduledAt).toISOString(),
      recordedAt,
      currentRevisionId: revision.id,
      createdBy: context.member.id,
    };
    data.appointments.push(appointment);
    await this.audit(context, "created", "appointment", appointment.id);
    this.recordOperation(context, appointment);
    return appointment;
  }

  async createIncident(context: RequestContext, input: IncidentInput) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<Incident>(context);
    if (replay.found) return replay.result;
    const data = state();
    assertActiveReferenceIds(
      input.childIds,
      new Set(
        data.children
          .filter(
            (child) =>
              child.workspaceId === context.workspace.id && child.active,
          )
          .map((child) => child.id),
      ),
      "INVALID_CHILD_REFERENCE",
    );
    const recordedAt = new Date().toISOString();
    const recordId = id("incident");
    const payload: Record<string, unknown> = { ...input };
    const revision = this.createRevision(
      data,
      "incident",
      recordId,
      payload,
      context.member.id,
      recordedAt,
    );
    const incident: Incident = {
      id: recordId,
      workspaceId: data.workspace.id,
      ...input,
      occurredAt: new Date(input.occurredAt).toISOString(),
      discoveredAt: input.discoveredAt
        ? new Date(input.discoveredAt).toISOString()
        : undefined,
      recordedAt,
      currentRevisionId: revision.id,
      createdBy: context.member.id,
    };
    data.incidents.push(incident);
    await this.audit(context, "created", "incident", incident.id);
    this.recordOperation(context, incident);
    return incident;
  }

  async correctRecord(context: RequestContext, input: CorrectionInput) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<RecordRevision>(context);
    if (replay.found) return replay.result;
    const data = state();
    const record = findRecord(data, input.recordType, input.recordId);
    if (!record) throw new Error("NOT_FOUND");
    if (input.recordType === "care_entry") {
      const dailyLog = data.dailyLogs.find(
        (log) => log.id === (record as CareEntry).dailyLogId,
      );
      if (!dailyLog) throw new Error("NOT_FOUND");
      if (dailyLog.status !== "finalized") throw new Error("DAY_NOT_FINALIZED");
    }
    const previous = data.revisions.find(
      (revision) => revision.id === record.currentRevisionId,
    );
    if (!previous) throw new Error("REVISION_NOT_FOUND");
    if (
      context.operation?.expectedRecordVersion &&
      context.operation.expectedRecordVersion !== previous.hash
    ) {
      throw new Error("VERSION_CONFLICT");
    }
    const recordedAt = new Date().toISOString();
    const payload = {
      ...recordPayload(record),
      [input.recordType === "incident" ? "observations" : "notes"]:
        input.correctedText,
    };
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: data.workspace.id,
      recordType: input.recordType,
      recordId: input.recordId,
      previousRevisionId: previous.id,
      revisionNumber: previous.revisionNumber + 1,
      payload,
      reason: input.reason,
      authorId: context.member.id,
      recordedAt,
      hash: createRevisionHash({
        payload,
        previousHash: previous.hash,
        authorId: context.member.id,
        recordedAt,
      }),
    };
    data.revisions.push(revision);
    record.currentRevisionId = revision.id;
    if (input.recordType === "incident") {
      (record as Incident).observations = input.correctedText;
    } else {
      (record as CareEntry | Appointment).notes = input.correctedText;
    }
    await this.audit(context, "corrected", input.recordType, input.recordId, {
      revisionNumber: revision.revisionNumber,
    }, previous.hash);
    this.recordOperation(context, revision);
    return revision;
  }

  async updateDailyLogNotes(
    context: RequestContext,
    input: DailyLogNotesInput,
  ) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<VersionedDailyLog>(context);
    if (replay.found) return replay.result;
    const data = state();
    const log = ensureDailyLog(data, input.localDate);
    if (log.status !== "open") throw new Error("DAY_FINALIZED");
    const currentVersion = dayVersionForState(data, log);
    if (
      context.operation?.expectedDayVersion &&
      context.operation.expectedDayVersion !== currentVersion
    ) {
      throw new Error("VERSION_CONFLICT");
    }
    if (input.notes) log.notes = input.notes;
    else delete log.notes;
    await this.audit(context, "updated", "daily_log", log.id);
    const result = {
      ...log,
      dayVersion: dayVersionForState(data, log),
    };
    this.recordOperation(context, result);
    return result;
  }

  async finalizeDailyLog(context: RequestContext, localDate: string) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<VersionedDailyLog>(context);
    if (replay.found) return replay.result;
    const data = state();
    const log = ensureDailyLog(data, localDate);
    const currentVersion = dayVersionForState(data, log);
    if (
      context.operation?.expectedDayVersion &&
      context.operation.expectedDayVersion !== currentVersion
    ) {
      throw new Error("CONFIRMATION_STALE");
    }
    this.assertAndConsumeConfirmation(context, log.id, currentVersion);
    if (log.status === "finalized") {
      return { ...log, dayVersion: currentVersion };
    }
    log.status = "finalized";
    log.finalizedAt = new Date().toISOString();
    log.finalizedBy = context.member.id;
    await this.audit(context, "finalized", "daily_log", log.id);
    const result = {
      ...log,
      dayVersion: dayVersionForState(data, log),
    };
    this.recordOperation(context, result);
    return result;
  }

  async createSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementCreateInput,
  ) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<SpecialArrangementDay[]>(context);
    if (replay.found) return replay.result;
    const data = state();
    if (
      input.days.some((day) =>
        data.specialArrangements.some(
          (arrangement) => arrangement.localDate === day.localDate,
        ),
      )
    ) {
      throw new Error("ARRANGEMENT_CONFLICT");
    }
    const sortedDays = [...input.days].sort((a, b) =>
      a.localDate.localeCompare(b.localDate),
    );
    if (
      sortedDays.some((day) =>
        data.dailyLogs.some(
          (log) =>
            log.localDate === day.localDate && log.status === "finalized",
        ),
      )
    ) {
      throw new Error("DAY_FINALIZED");
    }
    const preparedDays = sortedDays.map((day) => ({
      day,
      fields: normalizeArrangementFields(data, {
        title: input.title,
        note: input.note,
        status: "active",
        assignments: input.assignments,
        tasks: day.tasks,
      }),
    }));
    const seriesId = id("arrangement_series");
    const createdAt = new Date().toISOString();
    const created: SpecialArrangementDay[] = [];
    for (const { day, fields } of preparedDays) {
      const dailyLog = ensureDailyLog(data, day.localDate);
      const recordId = id("arrangement");
      const base = {
        id: recordId,
        workspaceId: data.workspace.id,
        seriesId,
        dailyLogId: dailyLog.id,
        localDate: day.localDate,
        ...fields,
        createdAt,
        updatedAt: createdAt,
        createdBy: context.member.id,
      };
      const revision = this.createRevision(
        data,
        "special_arrangement",
        recordId,
        arrangementPayload(base),
        context.member.id,
        createdAt,
      );
      const arrangement: SpecialArrangementDay = {
        ...base,
        currentRevisionId: revision.id,
      };
      data.specialArrangements.push(arrangement);
      created.push(arrangement);
      await this.audit(context, "created", "special_arrangement", recordId, {
        localDate: day.localDate,
      });
    }
    this.recordOperation(context, created);
    return created;
  }

  async updateSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementUpdateInput,
  ) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<VersionedSpecialArrangement>(context);
    if (replay.found) return replay.result;
    const data = state();
    const arrangement = data.specialArrangements.find(
      (item) => item.id === input.recordId,
    );
    if (!arrangement) throw new Error("NOT_FOUND");
    const dailyLog = data.dailyLogs.find((log) => log.id === arrangement.dailyLogId);
    if (!dailyLog) throw new Error("NOT_FOUND");
    if (dailyLog.status !== "open") throw new Error("DAY_FINALIZED");
    const revision = data.revisions.find(
      (item) => item.id === arrangement.currentRevisionId,
    );
    if (!revision) throw new Error("REVISION_NOT_FOUND");
    if (
      context.operation?.expectedRecordVersion &&
      context.operation.expectedRecordVersion !== revision.hash
    ) {
      throw new Error("VERSION_CONFLICT");
    }
    const fields = normalizeArrangementFields(data, input, arrangement);
    const updatedAt = new Date().toISOString();
    const payload = arrangementPayload({
      localDate: arrangement.localDate,
      ...fields,
      updatedAt,
    });
    revision.payload = payload;
    revision.authorId = context.member.id;
    revision.recordedAt = updatedAt;
    revision.hash = createRevisionHash({
      payload,
      authorId: context.member.id,
      recordedAt: updatedAt,
    });
    Object.assign(arrangement, fields, { updatedAt });
    await this.audit(context, "updated", "special_arrangement", arrangement.id, {
      revisionNumber: revision.revisionNumber,
    });
    const result = { ...arrangement, recordVersion: revision.hash };
    this.recordOperation(context, result);
    return result;
  }

  async correctSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementCorrectionInput,
  ) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<RecordRevision>(context);
    if (replay.found) return replay.result;
    const data = state();
    const arrangement = data.specialArrangements.find(
      (item) => item.id === input.recordId,
    );
    if (!arrangement) throw new Error("NOT_FOUND");
    const dailyLog = data.dailyLogs.find((log) => log.id === arrangement.dailyLogId);
    if (!dailyLog) throw new Error("NOT_FOUND");
    if (dailyLog.status !== "finalized") throw new Error("DAY_NOT_FINALIZED");
    const previous = data.revisions.find(
      (item) => item.id === arrangement.currentRevisionId,
    );
    if (!previous) throw new Error("REVISION_NOT_FOUND");
    if (
      context.operation?.expectedRecordVersion &&
      context.operation.expectedRecordVersion !== previous.hash
    ) {
      throw new Error("VERSION_CONFLICT");
    }
    const fields = normalizeArrangementFields(data, input, arrangement);
    const recordedAt = new Date().toISOString();
    const payload = arrangementPayload({
      localDate: arrangement.localDate,
      ...fields,
      updatedAt: recordedAt,
    });
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: data.workspace.id,
      recordType: "special_arrangement",
      recordId: arrangement.id,
      previousRevisionId: previous.id,
      revisionNumber: previous.revisionNumber + 1,
      payload,
      reason: input.reason,
      authorId: context.member.id,
      recordedAt,
      hash: createRevisionHash({
        payload,
        previousHash: previous.hash,
        authorId: context.member.id,
        recordedAt,
      }),
    };
    data.revisions.push(revision);
    Object.assign(arrangement, fields, {
      updatedAt: recordedAt,
      currentRevisionId: revision.id,
    });
    await this.audit(
      context,
      "corrected",
      "special_arrangement",
      arrangement.id,
      { revisionNumber: revision.revisionNumber },
      previous.hash,
    );
    this.recordOperation(context, revision);
    return revision;
  }

  async createReport(context: RequestContext, input: ReportInput) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<ReportSnapshot>(context);
    if (replay.found) return replay.result;
    const data = state();
    const includesChildren = (childIds: string[]) =>
      input.childIds.length === 0 ||
      childIds.some((childId) => input.childIds.includes(childId));
    const inRange = (dateTime: string) => {
      const localDate = dateTime.slice(0, 10);
      return localDate >= input.from && localDate <= input.to;
    };
    const entries = input.includeCare
      ? data.careEntries
          .filter(
            (entry) =>
              inRange(entry.occurredAt) &&
              includesChildren(entry.childIds) &&
              data.dailyLogs.some(
                (log) =>
                  log.id === entry.dailyLogId && log.status === "finalized",
              ),
          )
          .map((entry) =>
            withCurrentLateEntryStatus(entry, data.workspace.timezone),
          )
      : [];
    const appointments = input.includeAppointments
      ? data.appointments.filter(
          (appointment) =>
            inRange(appointment.scheduledAt) &&
            includesChildren(appointment.childIds),
        )
      : [];
    const incidents = input.includeIncidents
      ? data.incidents.filter(
          (incident) =>
            inRange(incident.occurredAt) &&
            includesChildren(incident.childIds),
        )
      : [];
    const arrangements = data.specialArrangements
      .filter((arrangement) => {
        const finalized = data.dailyLogs.some(
          (log) => log.id === arrangement.dailyLogId && log.status === "finalized",
        );
        return (
          arrangement.status === "active" &&
          finalized &&
          arrangement.localDate >= input.from &&
          arrangement.localDate <= input.to &&
          includesChildren(
            arrangement.assignments.map((assignment) => assignment.childId),
          )
        );
      })
      .map((arrangement) => arrangementForChildren(arrangement, input.childIds));
    const recordIds = new Set([
      ...entries.map((entry) => entry.id),
      ...appointments.map((appointment) => appointment.id),
      ...incidents.map((incident) => incident.id),
      ...arrangements.map((arrangement) => arrangement.id),
    ]);
    const revisions = data.revisions.filter((revision) =>
      recordIds.has(revision.recordId),
    );
    assertReportRevisionCoverage(
      [...entries, ...appointments, ...incidents, ...arrangements],
      revisions,
    );
    const revisionIds = revisions.map((revision) => revision.id);
    const attachments = data.attachments.filter((attachment) =>
      revisionIds.includes(attachment.revisionId),
    );
    const reportId = id("report");
    const report: ReportSnapshot = {
      id: reportId,
      workspaceId: data.workspace.id,
      createdBy: context.member.id,
      createdAt: new Date().toISOString(),
      status: "pending",
      filters: input,
      recordRevisionIds: revisionIds,
      attachmentIds: attachments.map((attachment) => attachment.id),
      ...reportArtifactPathnames(data.workspace.id, reportId),
    };
    const evidence: ReportEvidenceSnapshot = structuredClone({
      reportId,
      workspaceId: data.workspace.id,
      capturedAt: report.createdAt,
      workspace: data.workspace,
      children: data.children,
      caregivers: data.caregivers,
      entries,
      appointments,
      incidents,
      arrangements,
      revisions,
      attachments,
    });
    data.reports.push(report);
    data.reportEvidenceSnapshots.push(evidence);
    this.recordOperation(context, report);
    return report;
  }

  async retryReportGeneration(
    _context: RequestContext,
    reportId: string,
  ): Promise<ReportSnapshot> {
    const report = state().reports.find((item) => item.id === reportId);
    if (!report) throw new Error("NOT_FOUND");
    if (report.status === "failed") {
      report.status = "pending";
      delete report.error;
      delete report.workflowRunId;
    }
    return structuredClone(report);
  }

  async markReportScheduled(
    _context: RequestContext,
    reportId: string,
    workflowRunId: string,
  ): Promise<ReportSnapshot> {
    const report = state().reports.find((item) => item.id === reportId);
    if (!report) throw new Error("NOT_FOUND");
    if (report.status === "pending" && !report.workflowRunId) {
      report.workflowRunId = workflowRunId;
    }
    return structuredClone(report);
  }

  async markReportReady(
    context: RequestContext,
    reportId: string,
    artifacts: {
      manifestHash: string;
      pdfPathname: string;
      zipPathname: string;
      workflowRunId?: string;
    },
  ) {
    const report = state().reports.find((item) => item.id === reportId);
    if (!report) throw new Error("NOT_FOUND");
    if (report.status === "ready") return;
    Object.assign(report, artifacts, { status: "ready" as const });
    delete report.error;
    await this.audit(context, "report_generated", "report", reportId);
  }

  async markReportFailed(
    _context: RequestContext,
    reportId: string,
    error: string,
  ) {
    const report = state().reports.find((item) => item.id === reportId);
    if (!report) throw new Error("NOT_FOUND");
    if (report.status === "ready") return;
    Object.assign(report, { status: "failed" as const, error });
  }

  async updateSettings(
    context: RequestContext,
    input: WorkspaceSettingsInput,
  ) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<SettingsData>(context);
    if (replay.found) {
      context.workspace = replay.result.workspace;
      return replay.result;
    }
    const data = state();
    data.workspace.name = input.name;
    data.workspace.timezone = input.timezone;
    data.workspace.hardDeleteEnabled = input.hardDeleteEnabled;
    data.workspace.updatedAt = new Date().toISOString();
    const activeChildIds = new Set(input.children.map((child) => child.id));
    for (const child of data.children) {
      if (!activeChildIds.has(child.id)) child.active = false;
    }
    const childColors = ["sage", "blue", "amber", "violet"] as const;
    for (const [index, childInput] of input.children.entries()) {
      const child = data.children.find((item) => item.id === childInput.id);
      if (child) {
        child.displayName = childInput.displayName;
        child.birthdate = childInput.birthdate;
        child.active = true;
        child.sortOrder = index + 1;
      } else {
        data.children.push({
          id: childInput.id,
          workspaceId: data.workspace.id,
          displayName: childInput.displayName,
          birthdate: childInput.birthdate,
          color: childColors[index % childColors.length],
          active: true,
          sortOrder: index + 1,
        });
      }
    }
    for (const caregiverInput of input.caregivers) {
      if (caregiverInput.id) {
        const caregiver = data.caregivers.find(
          (item) =>
            item.id === caregiverInput.id &&
            item.workspaceId === context.workspace.id,
        );
        if (!caregiver) throw new Error("INVALID_CAREGIVER");
        caregiver.displayName = caregiverInput.displayName;
        caregiver.relationship = caregiverInput.relationship;
      } else {
        data.caregivers.push({
          id: id("caregiver"),
          workspaceId: context.workspace.id,
          displayName: caregiverInput.displayName,
          relationship: caregiverInput.relationship,
          isOwner: false,
          active: true,
        });
      }
    }
    const currentTemplate = latestTemplate(data);
    const nextItems = createNextRoutineItems(currentTemplate.items, input.routineItems);
    const templateChanged = JSON.stringify(nextItems) !== JSON.stringify(currentTemplate.items);
    if (templateChanged) {
      const effectiveFrom = localDateInTimezone(new Date(), data.workspace.timezone);
      const nextTemplate = {
        ...currentTemplate,
        id: id("template"),
        version: currentTemplate.version + 1,
        effectiveFrom,
        createdAt: new Date().toISOString(),
        items: nextItems,
      };
      data.templates.push(nextTemplate);
      const todayLog = data.dailyLogs.find(
        (log) => log.localDate === effectiveFrom && log.status === "open",
      );
      if (todayLog) todayLog.templateVersion = nextTemplate.version;
    }
    await this.audit(context, "settings_changed", "workspace", data.workspace.id);
    context.workspace = data.workspace;
    const result = await this.getSettings(context);
    this.recordOperation(context, result);
    return result;
  }

  async inviteReviewer(
    context: RequestContext,
    input: { email: string; displayName: string },
  ) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<Member>(context);
    if (replay.found) return replay.result;
    const data = state();
    const existing = data.members.find(
      (member) => member.email.toLowerCase() === input.email.toLowerCase(),
    );
    if (existing && existing.status !== "revoked") throw new Error("ALREADY_INVITED");
    const member: Member = existing ?? {
      id: id("member"),
      workspaceId: data.workspace.id,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      role: "reviewer",
      status: "invited",
      invitedAt: new Date().toISOString(),
    };
    member.status = "invited";
    member.invitedAt = new Date().toISOString();
    if (!existing) data.members.push(member);
    await this.audit(context, "invited", "member", member.id);
    this.recordOperation(context, member);
    return member;
  }

  async revokeReviewer(context: RequestContext, memberId: string) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<null>(context);
    if (replay.found) return;
    const member = state().members.find((item) => item.id === memberId);
    if (!member || member.role !== "reviewer") throw new Error("NOT_FOUND");
    member.status = "revoked";
    await this.audit(context, "revoked", "member", member.id);
    this.recordOperation(context, null);
  }

  async hardPurge(
    context: RequestContext,
    input: { recordType: RecordType; recordId: string; reason: string },
  ) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<PurgeTombstone>(context);
    if (replay.found) return replay.result;
    const data = state();
    const bundle = await this.getRecordBundle(context, input.recordType, input.recordId);
    if (!bundle) {
      const priorPurge = data.tombstones.find(
        (item) =>
          item.workspaceId === context.workspace.id &&
          item.recordType === input.recordType &&
          item.recordId === input.recordId,
      );
      if (!priorPurge) throw new Error("NOT_FOUND");
      this.recordOperation(context, priorPurge);
      return priorPurge;
    }
    if (!data.workspace.hardDeleteEnabled) throw new Error("HARD_DELETE_DISABLED");
    const priorHashes = bundle.revisions.map((revision) => revision.hash);
    const revisionIds = bundle.revisions.map((revision) => revision.id);
    const attachmentIds = bundle.attachments.map((attachment) => attachment.id);
    const affectedReports = data.reports.filter((report) =>
      report.recordRevisionIds.some((revisionId) =>
        revisionIds.includes(revisionId),
      ),
    );
    data.careEntries = data.careEntries.filter((item) => item.id !== input.recordId);
    data.appointments = data.appointments.filter((item) => item.id !== input.recordId);
    data.incidents = data.incidents.filter((item) => item.id !== input.recordId);
    data.revisions = data.revisions.filter(
      (revision) => !revisionIds.includes(revision.id),
    );
    data.attachments = data.attachments.filter(
      (attachment) => !attachmentIds.includes(attachment.id),
    );
    data.reports = data.reports.filter(
      (report) =>
        !report.recordRevisionIds.some((revisionId) => revisionIds.includes(revisionId)),
    );
    const affectedReportIds = new Set(affectedReports.map((report) => report.id));
    data.reportEvidenceSnapshots = data.reportEvidenceSnapshots.filter(
      (snapshot) => !affectedReportIds.has(snapshot.reportId),
    );
    const tombstone: PurgeTombstone = {
      id: id("purge"),
      workspaceId: data.workspace.id,
      recordType: input.recordType,
      recordId: input.recordId,
      priorHashes,
      cleanupPathnames: [
        ...bundle.attachments.map((attachment) => attachment.pathname),
        ...affectedReports.flatMap((report) =>
          [report.pdfPathname, report.zipPathname].filter(
            (pathname): pathname is string => Boolean(pathname),
          ),
        ),
      ],
      reason: input.reason,
      purgedBy: context.member.id,
      purgedAt: new Date().toISOString(),
    };
    data.tombstones.push(tombstone);
    await this.audit(context, "purged", input.recordType, input.recordId, {
      revisionCount: revisionIds.length,
      attachmentCount: attachmentIds.length,
    });
    this.recordOperation(context, tombstone);
    return tombstone;
  }

  async beginAccountDeletion(context: RequestContext): Promise<void> {
    void context;
  }

  async getAccountDeletionPaths(context: RequestContext): Promise<string[]> {
    if (context.member.role !== "owner") return [];
    const data = state();
    return [
      ...data.attachments.map((attachment) => attachment.pathname),
      ...data.reports.flatMap((report) =>
        [report.pdfPathname, report.zipPathname].filter(
          (pathname): pathname is string => Boolean(pathname),
        ),
      ),
    ];
  }

  async deleteAccountData(
    context: RequestContext,
  ): Promise<{ deletedWorkspace: boolean }> {
    const data = state();
    if (context.member.role === "reviewer") {
      data.members = data.members.filter(
        (member) =>
          member.id !== context.member.id ||
          member.workspaceId !== context.workspace.id,
      );
      return { deletedWorkspace: false };
    }

    data.members = [];
    data.children = [];
    data.caregivers = [];
    data.templates = [];
    data.dailyLogs = [];
    data.specialArrangements = [];
    data.careEntries = [];
    data.appointments = [];
    data.incidents = [];
    data.revisions = [];
    data.attachments = [];
    data.auditEvents = [];
    data.reports = [];
    data.reportEvidenceSnapshots = [];
    data.tombstones = [];
    data.agentOperations = [];
    data.agentConfirmations = [];
    return { deletedWorkspace: true };
  }

  async addAttachment(context: RequestContext, attachment: Attachment) {
    requireOwner(context.member.role);
    const replay = this.operationReplay<null>(context);
    if (replay.found) return;
    if (attachment.workspaceId !== context.workspace.id) throw new Error("FORBIDDEN");
    const existing = state().attachments.find((item) => item.id === attachment.id);
    if (existing) {
      if (
        existing.workspaceId !== attachment.workspaceId ||
        existing.recordType !== attachment.recordType ||
        existing.recordId !== attachment.recordId ||
        existing.pathname !== attachment.pathname
      ) {
        throw new Error("ATTACHMENT_CONFLICT");
      }
      this.recordOperation(context, null);
      return;
    }
    if (state().attachments.some((item) => item.pathname === attachment.pathname)) {
      throw new Error("ATTACHMENT_CONFLICT");
    }
    state().attachments.push(attachment);
    await this.audit(context, "created", "attachment", attachment.id);
    this.recordOperation(context, null);
  }

  async getAttachment(
    context: RequestContext,
    attachmentId: string,
  ): Promise<Attachment | null> {
    const data = state();
    const attachment = data.attachments.find(
      (item) =>
        item.id === attachmentId && item.workspaceId === context.workspace.id,
    );
    if (!attachment) return null;
    if (context.member.role === "reviewer" && attachment.recordType === "care_entry") {
      const entry = data.careEntries.find((item) => item.id === attachment.recordId);
      const finalized = entry && data.dailyLogs.some(
        (log) => log.id === entry.dailyLogId && log.status === "finalized",
      );
      if (!finalized) return null;
    }
    return attachment;
  }

  async recordAuditEvent(
    context: RequestContext,
    event: Omit<AuditEvent, "id" | "workspaceId" | "occurredAt" | "eventHash">,
  ) {
    await this.audit(
      context,
      event.action,
      event.targetType,
      event.targetId,
      event.metadata,
      event.previousHash,
    );
  }

  private createRevision(
    data: ParentingState,
    recordType: RevisionRecordType,
    recordId: string,
    payload: Record<string, unknown>,
    authorId: string,
    recordedAt: string,
  ) {
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: data.workspace.id,
      recordType,
      recordId,
      revisionNumber: 1,
      payload,
      reason: "Initial record",
      authorId,
      recordedAt,
      hash: createRevisionHash({ payload, authorId, recordedAt }),
    };
    data.revisions.push(revision);
    return revision;
  }

  private operationReplay<T>(
    context: RequestContext,
  ): { found: true; result: T } | { found: false } {
    const operation = context.operation;
    if (!operation) return { found: false };
    const operationKey = this.operationKey(context);
    const current = state().agentOperations.find(
      (item) =>
        item.workspaceId === context.workspace.id &&
        item.memberId === context.member.id &&
        item.operationKey === operationKey,
    );
    const legacy =
      operation.source === "mcp"
        ? state().agentOperations.find(
            (item) =>
              !item.operationKey &&
              item.workspaceId === context.workspace.id &&
              item.memberId === context.member.id &&
              item.oauthClientId === operation.clientKey &&
              item.operationId === operation.operationId,
          )
        : undefined;
    const existing = current ?? legacy;
    if (!existing) return { found: false };
    if (
      (existing.operationName ?? existing.toolName) !==
        operation.operationName ||
      existing.inputHash !== operation.inputHash ||
      (existing.source !== undefined && existing.source !== operation.source) ||
      (existing.clientKey !== undefined &&
        existing.clientKey !== operation.clientKey)
    ) {
      throw new Error("IDEMPOTENCY_CONFLICT");
    }
    return { found: true, result: structuredClone(existing.result) as T };
  }

  private recordOperation<T>(context: RequestContext, result: T): void {
    const operation = context.operation;
    if (!operation) return;
    const receipt: AgentOperationReceipt = {
      id: id("agent_operation"),
      workspaceId: context.workspace.id,
      memberId: context.member.id,
      source: operation.source,
      clientKey: operation.clientKey,
      operationName: operation.operationName,
      operationKey: this.operationKey(context),
      operationId: operation.operationId,
      inputHash: operation.inputHash,
      ...(operation.source === "mcp"
        ? {
            oauthClientId: operation.clientKey,
            toolName: operation.operationName,
          }
        : {}),
      result: structuredClone(result),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
    state().agentOperations.push(receipt);
  }

  private operationKey(context: RequestContext): string {
    const operation = context.operation;
    if (!operation) throw new Error("VALIDATION_ERROR");
    return sha256(
      canonicalJson({
        workspaceId: context.workspace.id,
        memberId: context.member.id,
        source: operation.source,
        clientKey: operation.clientKey,
        operationId: operation.operationId,
      }),
    );
  }

  private redactConfirmationHandle<T>(result: T): T {
    if (!result || typeof result !== "object" || Array.isArray(result)) return result;
    const redacted = { ...(result as Record<string, unknown>) };
    delete redacted.confirmationHandle;
    return redacted as T;
  }

  private assertAndConsumeConfirmation(
    context: RequestContext,
    targetId: string,
    baseVersion: string,
  ): void {
    const agent = context.agent;
    const operation = context.operation;
    if (!agent?.confirmationTokenHash) return;
    if (!operation) throw new Error("VALIDATION_ERROR");
    const data = state();
    const index = data.agentConfirmations.findIndex(
      (item) =>
        item.tokenHash === agent.confirmationTokenHash &&
        item.workspaceId === context.workspace.id &&
        item.memberId === context.member.id &&
        item.oauthClientId === agent.oauthClientId &&
        item.kind === agent.confirmationKind &&
        item.targetId === targetId,
    );
    if (index < 0) throw new Error("CONFIRMATION_EXPIRED");
    const confirmation = data.agentConfirmations[index];
    if (confirmation.expiresAt.getTime() <= Date.now()) {
      data.agentConfirmations.splice(index, 1);
      throw new Error("CONFIRMATION_EXPIRED");
    }
    if (confirmation.baseVersion !== baseVersion) {
      throw new Error("CONFIRMATION_STALE");
    }
    if (confirmation.consumedByOperationId) {
      if (confirmation.consumedByOperationId !== operation.operationId) {
        throw new Error("CONFIRMATION_EXPIRED");
      }
      return;
    }
    confirmation.consumedAt = new Date();
    confirmation.consumedByOperationId = operation.operationId;
  }

  private async audit(
    context: RequestContext,
    action: AuditEvent["action"],
    targetType: string,
    targetId: string,
    metadata?: Record<string, string | number | boolean>,
    previousHash?: string,
  ) {
    const data = state();
    const occurredAt = new Date().toISOString();
    const last = data.auditEvents.at(-1);
    const operationMetadata = context.operation
      ? {
          source: context.operation.source,
          clientKey: context.operation.clientKey,
          operationId: context.operation.operationId,
          operationName: context.operation.operationName,
          ...(context.operation.source === "mcp"
            ? {
                oauthClientId: context.operation.clientKey,
                toolName: context.operation.operationName,
              }
            : {}),
        }
      : {};
    const combinedMetadata = { ...metadata, ...operationMetadata };
    const base = {
      actorId: context.member.id,
      action,
      targetType,
      targetId,
      occurredAt,
      metadata:
        Object.keys(combinedMetadata).length > 0 ? combinedMetadata : undefined,
    };
    data.auditEvents.push({
      id: id("audit"),
      workspaceId: data.workspace.id,
      ...base,
      previousHash: previousHash ?? last?.eventHash,
      eventHash: createAuditHash({
        event: base,
        previousHash: previousHash ?? last?.eventHash,
      }),
    });
  }
}

export function resetMemoryRepository(): void {
  globalThis.__parentingLogState = createSeedState(true);
}
