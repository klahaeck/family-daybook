import "server-only";

import {
  lateEntryFor,
  localDateInTimezone,
  weekdayForLocalDate,
} from "@/lib/domain/dates";
import {
  createAuditHash,
  createRevisionHash,
  id,
} from "@/lib/domain/integrity";
import type {
  Appointment,
  Attachment,
  AuditEvent,
  CareEntry,
  DailyLog,
  Incident,
  Member,
  PurgeTombstone,
  RecordRevision,
  RecordType,
  RevisionRecordType,
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
  IncidentInput,
  ReportInput,
  SpecialArrangementCorrectionInput,
  SpecialArrangementCreateInput,
  SpecialArrangementUpdateInput,
  WorkspaceSettingsInput,
} from "@/lib/domain/schemas";
import { createSeedState, type ParentingState } from "./seed";
import {
  arrangementAtIncludedRevision,
  arrangementForChildren,
  createNextRoutineItems,
  recordPayload,
  requireOwner,
  toTimelineItems,
  withCurrentLateEntryStatus,
} from "./helpers";
import type {
  ParentingRepository,
  RecordBundle,
  ReportSource,
  RequestContext,
} from "./repository";
import type { Identity } from "@/lib/auth/identity";

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
  async resolveContext(identity: Identity): Promise<RequestContext> {
    const data = state();
    const member =
      data.members.find(
        (item) =>
          item.status === "active" &&
          (item.authUserId === identity.authUserId ||
            item.email.toLowerCase() === identity.email.toLowerCase()),
      ) ?? data.members.find((item) => item.role === "owner" && item.status === "active");
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

  async getDashboard(context: RequestContext, date: string) {
    const data = state();
    const dailyLog = ensureDailyLog(data, date);
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
    const completed = tasks.filter(
      (task) => task.entry?.status === "completed" || task.entry?.status === "not_applicable",
    ).length;

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
        completed,
        total: tasks.length,
        percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
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

  async getReportSource(
    _context: RequestContext,
    reportId: string,
  ): Promise<ReportSource | null> {
    const data = state();
    const snapshot = data.reports.find((report) => report.id === reportId);
    if (!snapshot) return null;
    const from = new Date(`${snapshot.filters.from}T00:00:00`).getTime();
    const to = new Date(`${snapshot.filters.to}T23:59:59.999`).getTime();
    const inRange = (value: string) => {
      const time = new Date(value).getTime();
      return time >= from && time <= to;
    };
    const includesChildren = (childIds: string[]) =>
      snapshot.filters.childIds.length === 0 ||
      childIds.some((childId) => snapshot.filters.childIds.includes(childId));
    const snapshotRevisions = data.revisions.filter((revision) =>
      snapshot.recordRevisionIds.includes(revision.id),
    );
    return {
      snapshot,
      workspace: data.workspace,
      children: data.children,
      caregivers: data.caregivers,
      entries: snapshot.filters.includeCare
        ? data.careEntries.filter(
            (entry) => inRange(entry.occurredAt) && includesChildren(entry.childIds),
          ).map((entry) =>
            withCurrentLateEntryStatus(entry, data.workspace.timezone),
          )
        : [],
      appointments: snapshot.filters.includeAppointments
        ? data.appointments.filter(
            (item) => inRange(item.scheduledAt) && includesChildren(item.childIds),
          )
        : [],
      incidents: snapshot.filters.includeIncidents
        ? data.incidents.filter(
            (item) => inRange(item.occurredAt) && includesChildren(item.childIds),
          )
        : [],
      arrangements: data.specialArrangements
        .map((arrangement) =>
          arrangementAtIncludedRevision(arrangement, snapshotRevisions),
        )
        .filter(
          (arrangement): arrangement is SpecialArrangementDay =>
            arrangement?.status === "active",
        )
        .map((arrangement) =>
          arrangementForChildren(arrangement, snapshot.filters.childIds),
        ),
      revisions: snapshotRevisions,
      attachments: data.attachments.filter((attachment) =>
        snapshot.attachmentIds.includes(attachment.id),
      ),
    };
  }

  async createCareEntry(context: RequestContext, input: CareEntryInput) {
    requireOwner(context.member.role);
    const data = state();
    const recordedAt = new Date().toISOString();
    const dailyLog = ensureDailyLog(data, input.localDate);
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
    const recordId = id("care");
    const payload: Record<string, unknown> = { ...normalizedInput };
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
    data.careEntries.push(entry);
    await this.audit(context, "created", "care_entry", entry.id);
    return entry;
  }

  async updateCareEntry(context: RequestContext, input: CareEntryUpdateInput) {
    requireOwner(context.member.role);
    const data = state();
    const entry = data.careEntries.find((item) => item.id === input.recordId);
    if (!entry) throw new Error("NOT_FOUND");
    const dailyLog = data.dailyLogs.find((log) => log.id === entry.dailyLogId);
    if (!dailyLog) throw new Error("NOT_FOUND");
    if (dailyLog.status !== "open") throw new Error("DAY_FINALIZED");
    if (entry.taskKey === "time_together" && !input.durationMinutes) {
      throw new Error("DURATION_REQUIRED");
    }
    const revision = data.revisions.find(
      (item) => item.id === entry.currentRevisionId,
    );
    if (!revision) throw new Error("REVISION_NOT_FOUND");
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
    return entry;
  }

  async correctCareEntry(context: RequestContext, input: CareEntryCorrectionInput) {
    requireOwner(context.member.role);
    const data = state();
    const entry = data.careEntries.find((item) => item.id === input.recordId);
    if (!entry) throw new Error("NOT_FOUND");
    const dailyLog = data.dailyLogs.find((log) => log.id === entry.dailyLogId);
    if (!dailyLog) throw new Error("NOT_FOUND");
    if (dailyLog.status !== "finalized") throw new Error("DAY_NOT_FINALIZED");
    if (entry.taskKey === "time_together" && !input.durationMinutes) {
      throw new Error("DURATION_REQUIRED");
    }
    const previous = data.revisions.find(
      (revision) => revision.id === entry.currentRevisionId,
    );
    if (!previous) throw new Error("REVISION_NOT_FOUND");

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
    return revision;
  }

  async createAppointment(context: RequestContext, input: AppointmentInput) {
    requireOwner(context.member.role);
    const data = state();
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
    return appointment;
  }

  async createIncident(context: RequestContext, input: IncidentInput) {
    requireOwner(context.member.role);
    const data = state();
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
    return incident;
  }

  async correctRecord(context: RequestContext, input: CorrectionInput) {
    requireOwner(context.member.role);
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
    return revision;
  }

  async finalizeDailyLog(context: RequestContext, localDate: string) {
    requireOwner(context.member.role);
    const data = state();
    const log = ensureDailyLog(data, localDate);
    if (log.status === "finalized") return log;
    log.status = "finalized";
    log.finalizedAt = new Date().toISOString();
    log.finalizedBy = context.member.id;
    await this.audit(context, "finalized", "daily_log", log.id);
    return log;
  }

  async createSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementCreateInput,
  ) {
    requireOwner(context.member.role);
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
    return created;
  }

  async updateSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementUpdateInput,
  ) {
    requireOwner(context.member.role);
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
    return arrangement;
  }

  async correctSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementCorrectionInput,
  ) {
    requireOwner(context.member.role);
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
    return revision;
  }

  async createReport(context: RequestContext, input: ReportInput) {
    requireOwner(context.member.role);
    const data = state();
    const recordRevisionIds = data.revisions
      .filter((revision) => {
        if (revision.recordType === "special_arrangement") return false;
        const record = findRecord(data, revision.recordType, revision.recordId);
        if (!record) return false;
        const when =
          "occurredAt" in record
            ? record.occurredAt
            : (record as Appointment).scheduledAt;
        const date = when.slice(0, 10);
        const includedType =
          (revision.recordType === "care_entry" && input.includeCare) ||
          (revision.recordType === "appointment" && input.includeAppointments) ||
          (revision.recordType === "incident" && input.includeIncidents);
        const finalizedCare =
          revision.recordType !== "care_entry" ||
          (record &&
            "dailyLogId" in record &&
            data.dailyLogs.some(
              (log) => log.id === record.dailyLogId && log.status === "finalized",
            ));
        const childIds = record.childIds;
        return (
          includedType &&
          finalizedCare &&
          date >= input.from &&
          date <= input.to &&
          (input.childIds.length === 0 ||
            childIds.some((childId) => input.childIds.includes(childId)))
        );
      })
      .map((revision) => revision.id);
    const includedArrangementIds = new Set(
      data.specialArrangements
      .filter((arrangement) => {
        const finalized = data.dailyLogs.some(
          (log) => log.id === arrangement.dailyLogId && log.status === "finalized",
        );
        const includedChild =
          input.childIds.length === 0 ||
          arrangement.assignments.some((assignment) =>
            input.childIds.includes(assignment.childId),
          );
        return (
          arrangement.status === "active" &&
          finalized &&
          arrangement.localDate >= input.from &&
          arrangement.localDate <= input.to &&
          includedChild
        );
      })
      .map((arrangement) => arrangement.id),
    );
    const arrangementRevisionIds = data.revisions
      .filter(
        (revision) =>
          revision.recordType === "special_arrangement" &&
          includedArrangementIds.has(revision.recordId),
      )
      .map((revision) => revision.id);
    const revisionIds = [...recordRevisionIds, ...arrangementRevisionIds];
    const attachments = data.attachments.filter((attachment) =>
      revisionIds.includes(attachment.revisionId),
    );
    const report: ReportSnapshot = {
      id: id("report"),
      workspaceId: data.workspace.id,
      createdBy: context.member.id,
      createdAt: new Date().toISOString(),
      status: "pending",
      filters: input,
      recordRevisionIds: revisionIds,
      attachmentIds: attachments.map((attachment) => attachment.id),
    };
    data.reports.push(report);
    return report;
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
    Object.assign(report, artifacts, { status: "ready" as const });
    await this.audit(context, "report_generated", "report", reportId);
  }

  async markReportFailed(
    _context: RequestContext,
    reportId: string,
    error: string,
  ) {
    const report = state().reports.find((item) => item.id === reportId);
    if (!report) throw new Error("NOT_FOUND");
    Object.assign(report, { status: "failed" as const, error });
  }

  async updateSettings(
    context: RequestContext,
    input: WorkspaceSettingsInput,
  ) {
    requireOwner(context.member.role);
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
    return this.getSettings(context);
  }

  async inviteReviewer(
    context: RequestContext,
    input: { email: string; displayName: string },
  ) {
    requireOwner(context.member.role);
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
    return member;
  }

  async revokeReviewer(context: RequestContext, memberId: string) {
    requireOwner(context.member.role);
    const member = state().members.find((item) => item.id === memberId);
    if (!member || member.role !== "reviewer") throw new Error("NOT_FOUND");
    member.status = "revoked";
    await this.audit(context, "revoked", "member", member.id);
  }

  async hardPurge(
    context: RequestContext,
    input: { recordType: RecordType; recordId: string; reason: string },
  ) {
    requireOwner(context.member.role);
    const data = state();
    if (!data.workspace.hardDeleteEnabled) throw new Error("HARD_DELETE_DISABLED");
    const bundle = await this.getRecordBundle(context, input.recordType, input.recordId);
    if (!bundle) throw new Error("NOT_FOUND");
    const priorHashes = bundle.revisions.map((revision) => revision.hash);
    const revisionIds = bundle.revisions.map((revision) => revision.id);
    const attachmentIds = bundle.attachments.map((attachment) => attachment.id);
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
    const tombstone: PurgeTombstone = {
      id: id("purge"),
      workspaceId: data.workspace.id,
      recordType: input.recordType,
      recordId: input.recordId,
      priorHashes,
      reason: input.reason,
      purgedBy: context.member.id,
      purgedAt: new Date().toISOString(),
    };
    data.tombstones.push(tombstone);
    await this.audit(context, "purged", input.recordType, input.recordId, {
      revisionCount: revisionIds.length,
      attachmentCount: attachmentIds.length,
    });
    return tombstone;
  }

  async addAttachment(context: RequestContext, attachment: Attachment) {
    requireOwner(context.member.role);
    state().attachments.push(attachment);
    await this.audit(context, "created", "attachment", attachment.id);
  }

  async getAttachment(
    context: RequestContext,
    attachmentId: string,
  ): Promise<Attachment | null> {
    const data = state();
    const attachment = data.attachments.find((item) => item.id === attachmentId);
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
    const base = {
      actorId: context.member.id,
      action,
      targetType,
      targetId,
      occurredAt,
      metadata,
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
