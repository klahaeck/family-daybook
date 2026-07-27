import "server-only";

import type { ClientSession, Collection, Document } from "mongodb";

import { collection, ensureMongoIndexes, getMongoClient } from "@/lib/db/mongodb";
import {
  lateEntryFor,
  localDateInTimezone,
  weekdayForLocalDate,
} from "@/lib/domain/dates";
import { createAuditHash, createRevisionHash, id } from "@/lib/domain/integrity";
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
  RecordType,
  RevisionRecordType,
  ReportSnapshot,
  RoutineTemplate,
  SpecialArrangementDay,
  SettingsData,
  TodayTask,
  Workspace,
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
import type { Identity } from "@/lib/auth/identity";
import { createSeedState } from "./seed";
import {
  arrangementAtIncludedRevision,
  arrangementForChildren,
  createNextRoutineItems,
  recordPayload,
  requireOwner,
  toTimelineItems,
  withCurrentLateEntryStatus,
} from "./helpers";
import { toPlainData } from "./to-plain-data";
import type {
  ParentingRepository,
  RecordBundle,
  ReportSource,
  RequestContext,
} from "./repository";

type AppDocument<T> = T & Document;

async function col<T>(name: string): Promise<Collection<AppDocument<T>>> {
  return collection<AppDocument<T>>(name);
}

function withinReport(report: ReportSnapshot, dateTime: string): boolean {
  const date = dateTime.slice(0, 10);
  return date >= report.filters.from && date <= report.filters.to;
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
  input: Pick<
    SpecialArrangementUpdateInput,
    "title" | "note" | "status" | "assignments" | "tasks"
  >,
  references: {
    childIds: Set<string>;
    caregiverIds: Set<string>;
    routineIds: Set<string>;
  },
  current?: SpecialArrangementDay,
) {
  const assignmentIds = new Set(input.assignments.map((assignment) => assignment.childId));
  if (
    input.assignments.length !== references.childIds.size ||
    assignmentIds.size !== references.childIds.size ||
    [...references.childIds].some((childId) => !assignmentIds.has(childId))
  ) {
    throw new Error("INVALID_ARRANGEMENT_CHILDREN");
  }
  if (
    input.assignments.some((assignment) =>
      assignment.caregiverIds.length === 0 ||
      new Set(assignment.caregiverIds).size !== assignment.caregiverIds.length ||
      assignment.caregiverIds.some(
        (caregiverId) => !references.caregiverIds.has(caregiverId),
      ),
    )
  ) {
    throw new Error("INVALID_ARRANGEMENT_CAREGIVER");
  }
  const currentTaskIds = new Set(current?.tasks.map((task) => task.id) ?? []);
  const submittedTaskIds = new Set<string>();
  const tasks = input.tasks.map((task, index) => {
    if (!references.childIds.has(task.childId)) {
      throw new Error("INVALID_ARRANGEMENT_TASK");
    }
    if (
      task.sourceRoutineItemId &&
      !references.routineIds.has(task.sourceRoutineItemId)
    ) {
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

export class MongoParentingRepository implements ParentingRepository {
  private indexesReady?: Promise<void>;

  private ensureReady() {
    this.indexesReady ??= ensureMongoIndexes();
    return this.indexesReady;
  }

  async resolveContext(identity: Identity): Promise<RequestContext> {
    await this.ensureReady();
    const members = await col<Member>("members");
    const normalizedEmail = identity.email.toLowerCase();
    let member = await members.findOne({
      authUserId: identity.authUserId,
      status: { $ne: "revoked" },
    });

    if (!member) {
      member = await members.findOne({
        email: normalizedEmail,
        status: { $ne: "revoked" },
        authUserId: { $exists: false },
      });
    }

    if (!member) {
      try {
        await this.bootstrap(identity);
      } catch (error) {
        member = await members.findOne({
          authUserId: identity.authUserId,
          status: { $ne: "revoked" },
        });
        if (!member) throw error;
      }
      member = await members.findOne({
        authUserId: identity.authUserId,
        status: { $ne: "revoked" },
      });
    }

    if (!member) throw new Error("FORBIDDEN");

    if (member.status === "invited" || !member.authUserId) {
      const result = await members.updateOne(
        {
          id: member.id,
          workspaceId: member.workspaceId,
          status: { $ne: "revoked" },
          $or: [
            { authUserId: identity.authUserId },
            { authUserId: { $exists: false } },
          ],
        },
        { $set: { status: "active", authUserId: identity.authUserId } },
      );
      if (!result.matchedCount) throw new Error("FORBIDDEN");
      member = { ...member, status: "active", authUserId: identity.authUserId };
    }

    const workspace = await (await col<Workspace>("workspaces")).findOne({
      id: member.workspaceId,
    });
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    const owner =
      member.id === workspace.ownerId
        ? member
        : await members.findOne({
            id: workspace.ownerId,
            workspaceId: workspace.id,
            role: "owner",
            status: "active",
          });
    if (!owner?.authUserId) throw new Error("BILLING_OWNER_REQUIRED");
    return toPlainData({
      identity,
      workspace,
      member,
      billingOwnerAuthUserId: owner.authUserId,
    });
  }

  async getDashboard(context: RequestContext, date: string) {
    const [children, caregivers, storedEntries] = await Promise.all([
      (await col<Child>("children"))
        .find({ workspaceId: context.workspace.id, active: true })
        .sort({ sortOrder: 1 })
        .toArray(),
      (await col<Caregiver>("caregivers"))
        .find({ workspaceId: context.workspace.id, active: true })
        .toArray(),
      (await col<CareEntry>("careEntries"))
        .find({ workspaceId: context.workspace.id })
        .sort({ occurredAt: -1 })
        .toArray(),
    ]);
    const entries = storedEntries.map((entry) =>
      withCurrentLateEntryStatus(entry, context.workspace.timezone),
    );
    const dailyLog = await this.ensureDailyLog(context, date);
    const dailyTemplate = await (await col<RoutineTemplate>("routineTemplates")).findOne({
      workspaceId: context.workspace.id,
      version: dailyLog.templateVersion,
    });
    if (!dailyTemplate) throw new Error("ROUTINE_TEMPLATE_NOT_FOUND");
    const dayEntries = entries.filter((entry) => entry.dailyLogId === dailyLog.id);
    const specialArrangement = await (
      await col<SpecialArrangementDay>("specialArrangementDays")
    ).findOne({
      workspaceId: context.workspace.id,
      dailyLogId: dailyLog.id,
      status: "active",
    });
    const weekday = weekdayForLocalDate(date);
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
      : dailyTemplate.items
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
    return toPlainData({
      workspace: context.workspace,
      member: context.member,
      date,
      dailyLog,
      children,
      caregivers,
      tasks,
      specialArrangement: specialArrangement ?? undefined,
      completion: {
        completed,
        total: tasks.length,
        percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
      },
      recentEntries: dayEntries,
    });
  }

  async getTimeline(context: RequestContext) {
    const [children, caregivers, allEntries, appointments, incidents, allArrangements, attachments, revisions, dailyLogs] = await Promise.all([
      (await col<Child>("children")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<Caregiver>("caregivers")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<CareEntry>("careEntries")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<Appointment>("appointments")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<Incident>("incidents")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<SpecialArrangementDay>("specialArrangementDays"))
        .find({ workspaceId: context.workspace.id })
        .toArray(),
      (await col<Attachment>("attachments")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<RecordRevision>("recordRevisions")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<DailyLog>("dailyLogs"))
        .find({ workspaceId: context.workspace.id })
        .toArray(),
    ]);
    const entries =
      context.member.role === "reviewer"
        ? allEntries.filter((entry) => dailyLogs.some((log) => log.id === entry.dailyLogId && log.status === "finalized"))
        : allEntries;
    const arrangements =
      context.member.role === "reviewer"
        ? allArrangements.filter((arrangement) =>
            dailyLogs.some(
              (log) =>
                log.id === arrangement.dailyLogId &&
                log.status === "finalized",
            ),
          )
        : allArrangements;
    const visibleRecordIds = new Set([
      ...entries.map((entry) => entry.id),
      ...appointments.map((appointment) => appointment.id),
      ...incidents.map((incident) => incident.id),
      ...arrangements.map((arrangement) => arrangement.id),
    ]);
    return toPlainData({
      workspace: context.workspace,
      children,
      caregivers,
      items: toTimelineItems({
        entries,
        appointments,
        incidents,
        arrangements,
        dailyLogs,
        timezone: context.workspace.timezone,
      }),
      attachments: attachments.filter((attachment) => visibleRecordIds.has(attachment.recordId)),
      revisions: revisions.filter((revision) => visibleRecordIds.has(revision.recordId)),
    });
  }

  async getAppointments(context: RequestContext) {
    return toPlainData(
      await (await col<Appointment>("appointments"))
        .find({ workspaceId: context.workspace.id })
        .sort({ scheduledAt: -1 })
        .toArray(),
    );
  }

  async getIncidents(context: RequestContext) {
    return toPlainData(
      await (await col<Incident>("incidents"))
        .find({ workspaceId: context.workspace.id })
        .sort({ occurredAt: -1 })
        .toArray(),
    );
  }

  async getReports(context: RequestContext) {
    return toPlainData(
      await (await col<ReportSnapshot>("reportSnapshots"))
        .find({ workspaceId: context.workspace.id })
        .sort({ createdAt: -1 })
        .toArray(),
    );
  }

  async getSettings(context: RequestContext): Promise<SettingsData> {
    const [members, children, caregivers, template] = await Promise.all([
      (await col<Member>("members")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<Child>("children")).find({ workspaceId: context.workspace.id, active: true }).sort({ sortOrder: 1 }).toArray(),
      (await col<Caregiver>("caregivers")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<RoutineTemplate>("routineTemplates")).findOne(
        { workspaceId: context.workspace.id },
        { sort: { version: -1 } },
      ),
    ]);
    if (!template) throw new Error("ROUTINE_TEMPLATE_NOT_FOUND");
    return toPlainData({ workspace: context.workspace, members, children, caregivers, template });
  }

  async getSpecialArrangements(context: RequestContext) {
    requireOwner(context.member.role);
    const [children, caregivers, template, days, dailyLogs] = await Promise.all([
      (await col<Child>("children"))
        .find({ workspaceId: context.workspace.id, active: true })
        .sort({ sortOrder: 1 })
        .toArray(),
      (await col<Caregiver>("caregivers"))
        .find({ workspaceId: context.workspace.id, active: true })
        .toArray(),
      (await col<RoutineTemplate>("routineTemplates")).findOne(
        { workspaceId: context.workspace.id },
        { sort: { version: -1 } },
      ),
      (await col<SpecialArrangementDay>("specialArrangementDays"))
        .find({ workspaceId: context.workspace.id })
        .sort({ localDate: -1 })
        .toArray(),
      (await col<DailyLog>("dailyLogs"))
        .find({ workspaceId: context.workspace.id })
        .toArray(),
    ]);
    if (!template) throw new Error("ROUTINE_TEMPLATE_NOT_FOUND");
    return toPlainData({
      workspace: context.workspace,
      children,
      caregivers,
      template,
      days: days.map((arrangement) => ({
        ...arrangement,
        dailyLogStatus: dailyLogs.find(
          (log) => log.id === arrangement.dailyLogId,
        )?.status,
      })),
    });
  }

  async getRecordBundle(
    context: RequestContext,
    recordType: RecordType,
    recordId: string,
  ): Promise<RecordBundle | null> {
    const record = await this.findRecord(context.workspace.id, recordType, recordId);
    if (!record) return null;
    if (context.member.role === "reviewer" && recordType === "care_entry") {
      const log = await (await col<DailyLog>("dailyLogs")).findOne({
        id: (record as CareEntry).dailyLogId,
        workspaceId: context.workspace.id,
        status: "finalized",
      });
      if (!log) return null;
    }
    const [revisions, attachments] = await Promise.all([
      (await col<RecordRevision>("recordRevisions"))
        .find({ workspaceId: context.workspace.id, recordType, recordId })
        .sort({ revisionNumber: 1 })
        .toArray(),
      (await col<Attachment>("attachments"))
        .find({ workspaceId: context.workspace.id, recordType, recordId })
        .toArray(),
    ]);
    return toPlainData({
      record:
        recordType === "care_entry"
          ? withCurrentLateEntryStatus(
              record as CareEntry,
              context.workspace.timezone,
            )
          : record,
      revisions,
      attachments,
    });
  }

  async getReportSource(
    context: RequestContext,
    reportId: string,
  ): Promise<ReportSource | null> {
    const snapshot = await (await col<ReportSnapshot>("reportSnapshots")).findOne({
      id: reportId,
      workspaceId: context.workspace.id,
    });
    if (!snapshot) return null;
    const [
      settings,
      children,
      entries,
      appointments,
      incidents,
      arrangements,
      revisions,
      attachments,
    ] =
      await Promise.all([
        this.getSettings(context),
        (await col<Child>("children"))
          .find({ workspaceId: context.workspace.id })
          .sort({ sortOrder: 1 })
          .toArray(),
        (await col<CareEntry>("careEntries"))
          .find({ workspaceId: context.workspace.id })
          .toArray(),
        this.getAppointments(context),
        this.getIncidents(context),
        (await col<SpecialArrangementDay>("specialArrangementDays"))
          .find({ workspaceId: context.workspace.id })
          .toArray(),
        (await col<RecordRevision>("recordRevisions"))
          .find({
            workspaceId: context.workspace.id,
            id: { $in: snapshot.recordRevisionIds },
          })
          .toArray(),
        (await col<Attachment>("attachments"))
          .find({
            workspaceId: context.workspace.id,
            id: { $in: snapshot.attachmentIds },
          })
          .toArray(),
      ]);
    const includesChild = (ids: string[]) =>
      snapshot.filters.childIds.length === 0 ||
      ids.some((childId) => snapshot.filters.childIds.includes(childId));
    return toPlainData({
      snapshot,
      workspace: context.workspace,
      children,
      caregivers: settings.caregivers,
      entries: snapshot.filters.includeCare
        ? entries.filter((item) => withinReport(snapshot, item.occurredAt) && includesChild(item.childIds))
            .map((entry) =>
              withCurrentLateEntryStatus(
                entry,
                context.workspace.timezone,
              ),
            )
        : [],
      appointments: snapshot.filters.includeAppointments
        ? appointments.filter((item) => withinReport(snapshot, item.scheduledAt) && includesChild(item.childIds))
        : [],
      incidents: snapshot.filters.includeIncidents
        ? incidents.filter((item) => withinReport(snapshot, item.occurredAt) && includesChild(item.childIds))
        : [],
      arrangements: arrangements
        .map((arrangement) =>
          arrangementAtIncludedRevision(arrangement, revisions),
        )
        .filter(
          (arrangement): arrangement is SpecialArrangementDay =>
            arrangement?.status === "active",
        )
        .map((arrangement) =>
          arrangementForChildren(arrangement, snapshot.filters.childIds),
        ),
      revisions,
      attachments,
    });
  }

  async createCareEntry(context: RequestContext, input: CareEntryInput) {
    requireOwner(context.member.role);
    const log = await this.ensureDailyLog(context, input.localDate);
    if (input.templateItemId && input.arrangementTaskId) {
      throw new Error("INVALID_CARE_TASK");
    }
    const arrangement = input.arrangementTaskId
      ? await (await col<SpecialArrangementDay>("specialArrangementDays")).findOne({
          workspaceId: context.workspace.id,
          dailyLogId: log.id,
          status: "active",
          "tasks.id": input.arrangementTaskId,
        })
      : null;
    const arrangementTask = arrangement?.tasks.find(
      (task) => task.id === input.arrangementTaskId,
    );
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
    const recordedAt = new Date().toISOString();
    const recordId = id("care");
    const revision = this.initialRevision(
      context,
      "care_entry",
      recordId,
      { ...normalizedInput },
      recordedAt,
    );
    const entry: CareEntry = {
      id: recordId,
      workspaceId: context.workspace.id,
      dailyLogId: log.id,
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
    await this.transaction(async (session) => {
      await (await col<CareEntry>("careEntries")).insertOne(entry, { session });
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await this.insertAudit(context, "created", "care_entry", entry.id, session);
    });
    return toPlainData(entry);
  }

  async updateCareEntry(context: RequestContext, input: CareEntryUpdateInput) {
    requireOwner(context.member.role);
    const entry = await (await col<CareEntry>("careEntries")).findOne({
      id: input.recordId,
      workspaceId: context.workspace.id,
    });
    if (!entry) throw new Error("NOT_FOUND");
    if (entry.taskKey === "time_together" && !input.durationMinutes) {
      throw new Error("DURATION_REQUIRED");
    }
    const revision = await (await col<RecordRevision>("recordRevisions")).findOne({
      id: entry.currentRevisionId,
      workspaceId: context.workspace.id,
    });
    if (!revision) throw new Error("REVISION_NOT_FOUND");
    const previousRevision = revision.previousRevisionId
      ? await (await col<RecordRevision>("recordRevisions")).findOne({
          id: revision.previousRevisionId,
          workspaceId: context.workspace.id,
        })
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
    const optionalFields = ["durationMinutes", "activityType", "notes"] as const;
    for (const field of optionalFields) {
      if (update[field] === undefined) delete payload[field];
    }
    const hash = createRevisionHash({
      payload,
      previousHash: previousRevision?.hash,
      authorId: context.member.id,
      recordedAt: savedAt,
    });
    const lateEntry = lateEntryFor(
      occurredAt,
      entry.recordedAt,
      context.workspace.timezone,
    );
    const setFields: Record<string, unknown> = {
      childIds: update.childIds,
      caregiverIds: update.caregiverIds,
      status: update.status,
      occurredAt,
      lateEntry,
    };
    const unsetFields: Record<string, ""> = {};
    for (const field of optionalFields) {
      if (update[field] === undefined) unsetFields[field] = "";
      else setFields[field] = update[field];
    }

    await this.transaction(async (session) => {
      const openLog = await (await col<DailyLog>("dailyLogs")).updateOne(
        {
          id: entry.dailyLogId,
          workspaceId: context.workspace.id,
          status: "open",
        },
        { $set: { status: "open" } },
        { session },
      );
      if (!openLog.matchedCount) throw new Error("DAY_FINALIZED");
      await (await col<RecordRevision>("recordRevisions")).updateOne(
        { id: revision.id, workspaceId: context.workspace.id },
        { $set: { payload, authorId: context.member.id, recordedAt: savedAt, hash } },
        { session },
      );
      await (await col<CareEntry>("careEntries")).updateOne(
        { id: entry.id, workspaceId: context.workspace.id },
        {
          $set: setFields,
          ...(Object.keys(unsetFields).length ? { $unset: unsetFields } : {}),
        },
        { session },
      );
      await this.insertAudit(context, "updated", "care_entry", entry.id, session, {
        revisionNumber: revision.revisionNumber,
      });
    });

    return toPlainData({ ...entry, ...update, occurredAt, lateEntry });
  }

  async correctCareEntry(context: RequestContext, input: CareEntryCorrectionInput) {
    requireOwner(context.member.role);
    const entry = await (await col<CareEntry>("careEntries")).findOne({
      id: input.recordId,
      workspaceId: context.workspace.id,
    });
    if (!entry) throw new Error("NOT_FOUND");
    const dailyLog = await (await col<DailyLog>("dailyLogs")).findOne({
      id: entry.dailyLogId,
      workspaceId: context.workspace.id,
    });
    if (!dailyLog) throw new Error("NOT_FOUND");
    if (dailyLog.status !== "finalized") throw new Error("DAY_NOT_FINALIZED");
    if (entry.taskKey === "time_together" && !input.durationMinutes) {
      throw new Error("DURATION_REQUIRED");
    }
    const previous = await (await col<RecordRevision>("recordRevisions")).findOne({
      id: entry.currentRevisionId,
      workspaceId: context.workspace.id,
    });
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
    const payload = { ...recordPayload(toPlainData(entry)), ...correction, occurredAt };
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: context.workspace.id,
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
    const lateEntry = lateEntryFor(
      occurredAt,
      entry.recordedAt,
      context.workspace.timezone,
    );
    const optionalFields = ["durationMinutes", "activityType", "notes"] as const;
    const setFields: Record<string, unknown> = {
      childIds: correction.childIds,
      caregiverIds: correction.caregiverIds,
      status: correction.status,
      occurredAt,
      currentRevisionId: revision.id,
      lateEntry,
    };
    const unsetFields: Record<string, ""> = {};
    for (const field of optionalFields) {
      if (correction[field] === undefined) unsetFields[field] = "";
      else setFields[field] = correction[field];
    }

    await this.transaction(async (session) => {
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await (await col<CareEntry>("careEntries")).updateOne(
        { id: entry.id, workspaceId: context.workspace.id },
        {
          $set: setFields,
          ...(Object.keys(unsetFields).length ? { $unset: unsetFields } : {}),
        },
        { session },
      );
      await this.insertAudit(
        context,
        "corrected",
        "care_entry",
        entry.id,
        session,
        { revisionNumber: revision.revisionNumber },
      );
    });
    return toPlainData(revision);
  }

  async createAppointment(context: RequestContext, input: AppointmentInput) {
    requireOwner(context.member.role);
    const recordedAt = new Date().toISOString();
    const recordId = id("appointment");
    const revision = this.initialRevision(context, "appointment", recordId, { ...input }, recordedAt);
    const appointment: Appointment = {
      id: recordId,
      workspaceId: context.workspace.id,
      ...input,
      arrivedAt: input.arrivedAt || undefined,
      scheduledAt: new Date(input.scheduledAt).toISOString(),
      recordedAt,
      currentRevisionId: revision.id,
      createdBy: context.member.id,
    };
    await this.transaction(async (session) => {
      await (await col<Appointment>("appointments")).insertOne(appointment, { session });
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await this.insertAudit(context, "created", "appointment", recordId, session);
    });
    return toPlainData(appointment);
  }

  async createIncident(context: RequestContext, input: IncidentInput) {
    requireOwner(context.member.role);
    const recordedAt = new Date().toISOString();
    const recordId = id("incident");
    const revision = this.initialRevision(context, "incident", recordId, { ...input }, recordedAt);
    const incident: Incident = {
      id: recordId,
      workspaceId: context.workspace.id,
      ...input,
      occurredAt: new Date(input.occurredAt).toISOString(),
      discoveredAt: input.discoveredAt ? new Date(input.discoveredAt).toISOString() : undefined,
      recordedAt,
      currentRevisionId: revision.id,
      createdBy: context.member.id,
    };
    await this.transaction(async (session) => {
      await (await col<Incident>("incidents")).insertOne(incident, { session });
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await this.insertAudit(context, "created", "incident", recordId, session);
    });
    return toPlainData(incident);
  }

  async correctRecord(context: RequestContext, input: CorrectionInput) {
    requireOwner(context.member.role);
    const bundle = await this.getRecordBundle(context, input.recordType, input.recordId);
    if (!bundle) throw new Error("NOT_FOUND");
    if (input.recordType === "care_entry") {
      const dailyLog = await (await col<DailyLog>("dailyLogs")).findOne({
        id: (bundle.record as CareEntry).dailyLogId,
        workspaceId: context.workspace.id,
      });
      if (!dailyLog) throw new Error("NOT_FOUND");
      if (dailyLog.status !== "finalized") throw new Error("DAY_NOT_FINALIZED");
    }
    const previous = bundle.revisions.at(-1);
    if (!previous) throw new Error("REVISION_NOT_FOUND");
    const recordedAt = new Date().toISOString();
    const payload = {
      ...recordPayload(bundle.record),
      [input.recordType === "incident" ? "observations" : "notes"]: input.correctedText,
    };
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: context.workspace.id,
      recordType: input.recordType,
      recordId: input.recordId,
      previousRevisionId: previous.id,
      revisionNumber: previous.revisionNumber + 1,
      payload,
      reason: input.reason,
      authorId: context.member.id,
      recordedAt,
      hash: createRevisionHash({ payload, previousHash: previous.hash, authorId: context.member.id, recordedAt }),
    };
    const collectionName =
      input.recordType === "care_entry"
        ? "careEntries"
        : input.recordType === "appointment"
          ? "appointments"
          : "incidents";
    const correctedField = input.recordType === "incident" ? "observations" : "notes";
    await this.transaction(async (session) => {
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await (await col<Record<string, unknown>>(collectionName)).updateOne(
        { id: input.recordId, workspaceId: context.workspace.id },
        { $set: { currentRevisionId: revision.id, [correctedField]: input.correctedText } },
        { session },
      );
      await this.insertAudit(context, "corrected", input.recordType, input.recordId, session, {
        revisionNumber: revision.revisionNumber,
      });
    });
    return toPlainData(revision);
  }

  async finalizeDailyLog(context: RequestContext, localDate: string) {
    requireOwner(context.member.role);
    const log = await this.ensureDailyLog(context, localDate);
    if (log.status === "finalized") return toPlainData(log);
    const finalizedAt = new Date().toISOString();
    await this.transaction(async (session) => {
      await (await col<DailyLog>("dailyLogs")).updateOne(
        { id: log.id },
        { $set: { status: "finalized", finalizedAt, finalizedBy: context.member.id } },
        { session },
      );
      await this.insertAudit(context, "finalized", "daily_log", log.id, session);
    });
    return toPlainData({
      ...log,
      status: "finalized" as const,
      finalizedAt,
      finalizedBy: context.member.id,
    });
  }

  async createSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementCreateInput,
  ) {
    requireOwner(context.member.role);
    const references = await this.getArrangementReferences(context);
    const seriesId = id("arrangement_series");
    const createdAt = new Date().toISOString();
    const created: SpecialArrangementDay[] = [];
    try {
      await this.transaction(async (session) => {
        const arrangements = await col<SpecialArrangementDay>(
          "specialArrangementDays",
        );
        const conflict = await arrangements.findOne(
          {
            workspaceId: context.workspace.id,
            localDate: { $in: input.days.map((day) => day.localDate) },
          },
          { session },
        );
        if (conflict) throw new Error("ARRANGEMENT_CONFLICT");
        for (const day of [...input.days].sort((a, b) =>
          a.localDate.localeCompare(b.localDate),
        )) {
          const dailyLog = await this.ensureDailyLog(context, day.localDate, session);
          if (dailyLog.status !== "open") throw new Error("DAY_FINALIZED");
          const fields = normalizeArrangementFields(
            {
              title: input.title,
              note: input.note,
              status: "active",
              assignments: input.assignments,
              tasks: day.tasks,
            },
            references,
          );
          const recordId = id("arrangement");
          const base = {
            id: recordId,
            workspaceId: context.workspace.id,
            seriesId,
            dailyLogId: dailyLog.id,
            localDate: day.localDate,
            ...fields,
            createdAt,
            updatedAt: createdAt,
            createdBy: context.member.id,
          };
          const revision = this.initialRevision(
            context,
            "special_arrangement",
            recordId,
            arrangementPayload(base),
            createdAt,
          );
          const arrangement: SpecialArrangementDay = {
            ...base,
            currentRevisionId: revision.id,
          };
          await arrangements.insertOne(arrangement, { session });
          await (await col<RecordRevision>("recordRevisions")).insertOne(revision, {
            session,
          });
          await this.insertAudit(
            context,
            "created",
            "special_arrangement",
            recordId,
            session,
            { localDate: day.localDate },
          );
          created.push(arrangement);
        }
      });
    } catch (error) {
      if (
        (error instanceof Error && error.message === "ARRANGEMENT_CONFLICT") ||
        (typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === 11000)
      ) {
        throw new Error("ARRANGEMENT_CONFLICT");
      }
      throw error;
    }
    return toPlainData(created);
  }

  async updateSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementUpdateInput,
  ) {
    requireOwner(context.member.role);
    const arrangements = await col<SpecialArrangementDay>(
      "specialArrangementDays",
    );
    const arrangement = await arrangements.findOne({
      id: input.recordId,
      workspaceId: context.workspace.id,
    });
    if (!arrangement) throw new Error("NOT_FOUND");
    const references = await this.getArrangementReferences(context);
    const fields = normalizeArrangementFields(input, references, arrangement);
    const revision = await (await col<RecordRevision>("recordRevisions")).findOne({
      id: arrangement.currentRevisionId,
      workspaceId: context.workspace.id,
    });
    if (!revision) throw new Error("REVISION_NOT_FOUND");
    const updatedAt = new Date().toISOString();
    const payload = arrangementPayload({
      localDate: arrangement.localDate,
      ...fields,
      updatedAt,
    });
    const hash = createRevisionHash({
      payload,
      authorId: context.member.id,
      recordedAt: updatedAt,
    });
    await this.transaction(async (session) => {
      const openLog = await (await col<DailyLog>("dailyLogs")).updateOne(
        {
          id: arrangement.dailyLogId,
          workspaceId: context.workspace.id,
          status: "open",
        },
        { $set: { status: "open" } },
        { session },
      );
      if (!openLog.matchedCount) throw new Error("DAY_FINALIZED");
      await (await col<RecordRevision>("recordRevisions")).updateOne(
        { id: revision.id, workspaceId: context.workspace.id },
        {
          $set: {
            payload,
            authorId: context.member.id,
            recordedAt: updatedAt,
            hash,
          },
        },
        { session },
      );
      const arrangementResult = await arrangements.updateOne(
        {
          id: arrangement.id,
          workspaceId: context.workspace.id,
          currentRevisionId: revision.id,
        },
        { $set: { ...fields, updatedAt } },
        { session },
      );
      if (!arrangementResult.matchedCount) {
        throw new Error("ARRANGEMENT_CONFLICT");
      }
      await this.insertAudit(
        context,
        "updated",
        "special_arrangement",
        arrangement.id,
        session,
        { revisionNumber: revision.revisionNumber },
      );
    });
    return toPlainData({ ...arrangement, ...fields, updatedAt });
  }

  async correctSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementCorrectionInput,
  ) {
    requireOwner(context.member.role);
    const arrangements = await col<SpecialArrangementDay>(
      "specialArrangementDays",
    );
    const arrangement = await arrangements.findOne({
      id: input.recordId,
      workspaceId: context.workspace.id,
    });
    if (!arrangement) throw new Error("NOT_FOUND");
    const finalizedLog = await (await col<DailyLog>("dailyLogs")).findOne({
      id: arrangement.dailyLogId,
      workspaceId: context.workspace.id,
      status: "finalized",
    });
    if (!finalizedLog) throw new Error("DAY_NOT_FINALIZED");
    const previous = await (await col<RecordRevision>("recordRevisions")).findOne({
      id: arrangement.currentRevisionId,
      workspaceId: context.workspace.id,
    });
    if (!previous) throw new Error("REVISION_NOT_FOUND");
    const references = await this.getArrangementReferences(context);
    const fields = normalizeArrangementFields(input, references, arrangement);
    const recordedAt = new Date().toISOString();
    const payload = arrangementPayload({
      localDate: arrangement.localDate,
      ...fields,
      updatedAt: recordedAt,
    });
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: context.workspace.id,
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
    await this.transaction(async (session) => {
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, {
        session,
      });
      const result = await arrangements.updateOne(
        {
          id: arrangement.id,
          workspaceId: context.workspace.id,
          currentRevisionId: previous.id,
        },
        {
          $set: {
            ...fields,
            updatedAt: recordedAt,
            currentRevisionId: revision.id,
          },
        },
        { session },
      );
      if (!result.matchedCount) throw new Error("ARRANGEMENT_CONFLICT");
      await this.insertAudit(
        context,
        "corrected",
        "special_arrangement",
        arrangement.id,
        session,
        { revisionNumber: revision.revisionNumber },
        previous.hash,
      );
    });
    return toPlainData(revision);
  }

  async createReport(context: RequestContext, input: ReportInput) {
    requireOwner(context.member.role);
    const [timeline, finalizedLogs] = await Promise.all([
      this.getTimeline(context),
      (await col<DailyLog>("dailyLogs"))
        .find({ workspaceId: context.workspace.id, status: "finalized" })
        .toArray(),
    ]);
    const finalizedCareEntries = await (await col<CareEntry>("careEntries"))
      .find({
        workspaceId: context.workspace.id,
        dailyLogId: { $in: finalizedLogs.map((log) => log.id) },
      })
      .toArray();
    const finalizedCareIds = new Set(finalizedCareEntries.map((entry) => entry.id));
    const included = timeline.items.filter((item) => {
      const date = item.occurredAt.slice(0, 10);
      const includeKind =
        (item.kind === "care" && input.includeCare) ||
        (item.kind === "appointment" && input.includeAppointments) ||
        (item.kind === "incident" && input.includeIncidents);
      return (
        includeKind &&
        (item.kind !== "care" || finalizedCareIds.has(item.id)) &&
        date >= input.from &&
        date <= input.to &&
        (input.childIds.length === 0 || item.childIds.some((id) => input.childIds.includes(id)))
      );
    });
    const recordIds = included.map((item) => item.id);
    const finalizedLogIds = new Set(finalizedLogs.map((log) => log.id));
    const arrangements = await (
      await col<SpecialArrangementDay>("specialArrangementDays")
    )
      .find({
        workspaceId: context.workspace.id,
        status: "active",
        localDate: { $gte: input.from, $lte: input.to },
      })
      .toArray();
    const arrangementIds = arrangements
      .filter(
        (arrangement) =>
          finalizedLogIds.has(arrangement.dailyLogId) &&
          (input.childIds.length === 0 ||
            arrangement.assignments.some((assignment) =>
              input.childIds.includes(assignment.childId),
            )),
      )
      .map((arrangement) => arrangement.id);
    const revisions = await (await col<RecordRevision>("recordRevisions"))
      .find({
        workspaceId: context.workspace.id,
        recordId: { $in: [...recordIds, ...arrangementIds] },
      })
      .toArray();
    const attachments = await (await col<Attachment>("attachments"))
      .find({ workspaceId: context.workspace.id, recordId: { $in: recordIds } })
      .toArray();
    const report: ReportSnapshot = {
      id: id("report"),
      workspaceId: context.workspace.id,
      createdBy: context.member.id,
      createdAt: new Date().toISOString(),
      status: "pending",
      filters: input,
      recordRevisionIds: revisions.map((item) => item.id),
      attachmentIds: attachments.map((item) => item.id),
    };
    await (await col<ReportSnapshot>("reportSnapshots")).insertOne(report);
    return toPlainData(report);
  }

  async markReportReady(
    context: RequestContext,
    reportId: string,
    artifacts: { manifestHash: string; pdfPathname: string; zipPathname: string; workflowRunId?: string },
  ) {
    await this.transaction(async (session) => {
      await (await col<ReportSnapshot>("reportSnapshots")).updateOne(
        { id: reportId, workspaceId: context.workspace.id },
        { $set: { ...artifacts, status: "ready" } },
        { session },
      );
      await this.insertAudit(context, "report_generated", "report", reportId, session);
    });
  }

  async markReportFailed(context: RequestContext, reportId: string, error: string) {
    await (await col<ReportSnapshot>("reportSnapshots")).updateOne(
      { id: reportId, workspaceId: context.workspace.id },
      { $set: { status: "failed", error } },
    );
  }

  async updateSettings(context: RequestContext, input: WorkspaceSettingsInput) {
    requireOwner(context.member.role);
    await this.transaction(async (session) => {
      await (await col<Workspace>("workspaces")).updateOne(
        { id: context.workspace.id },
        { $set: { name: input.name, timezone: input.timezone, hardDeleteEnabled: input.hardDeleteEnabled, updatedAt: new Date().toISOString() } },
        { session },
      );
      const children = await col<Child>("children");
      const activeChildIds = input.children.map((child) => child.id);
      await children.updateMany(
        { workspaceId: context.workspace.id, id: { $nin: activeChildIds } },
        { $set: { active: false } },
        { session },
      );
      const childColors = ["sage", "blue", "amber", "violet"] as const;
      for (const [index, child] of input.children.entries()) {
        await children.updateOne(
          { id: child.id, workspaceId: context.workspace.id },
          {
            $set: {
              displayName: child.displayName,
              birthdate: child.birthdate,
              active: true,
              sortOrder: index + 1,
            },
            $setOnInsert: {
              id: child.id,
              workspaceId: context.workspace.id,
              color: childColors[index % childColors.length],
            },
          },
          { upsert: true, session },
        );
      }
      for (const caregiver of input.caregivers) {
        const caregivers = await col<Caregiver>("caregivers");
        if (caregiver.id) {
          const result = await caregivers.updateOne(
            { id: caregiver.id, workspaceId: context.workspace.id },
            { $set: { displayName: caregiver.displayName, relationship: caregiver.relationship } },
            { session },
          );
          if (!result.matchedCount) throw new Error("INVALID_CAREGIVER");
        } else {
          await caregivers.insertOne(
            {
              id: id("caregiver"),
              workspaceId: context.workspace.id,
              displayName: caregiver.displayName,
              relationship: caregiver.relationship,
              isOwner: false,
              active: true,
            },
            { session },
          );
        }
      }
      const currentTemplate = await (await col<RoutineTemplate>("routineTemplates")).findOne(
        { workspaceId: context.workspace.id },
        { sort: { version: -1 }, session },
      );
      if (currentTemplate) {
        const nextItems = createNextRoutineItems(currentTemplate.items, input.routineItems);
        if (JSON.stringify(nextItems) !== JSON.stringify(currentTemplate.items)) {
          const effectiveFrom = localDateInTimezone(new Date(), input.timezone);
          const nextVersion = currentTemplate.version + 1;
          await (await col<RoutineTemplate>("routineTemplates")).insertOne(
            {
              id: id("template"),
              workspaceId: currentTemplate.workspaceId,
              version: nextVersion,
              effectiveFrom,
              createdAt: new Date().toISOString(),
              items: nextItems,
            },
            { session },
          );
          await (await col<DailyLog>("dailyLogs")).updateOne(
            {
              workspaceId: context.workspace.id,
              localDate: effectiveFrom,
              status: "open",
            },
            { $set: { templateVersion: nextVersion } },
            { session },
          );
        }
      }
      await this.insertAudit(context, "settings_changed", "workspace", context.workspace.id, session);
    });
    context.workspace = {
      ...context.workspace,
      name: input.name,
      timezone: input.timezone,
      hardDeleteEnabled: input.hardDeleteEnabled,
    };
    return this.getSettings(context);
  }

  async inviteReviewer(context: RequestContext, input: { email: string; displayName: string }) {
    requireOwner(context.member.role);
    const members = await col<Member>("members");
    const existing = await members.findOne({ workspaceId: context.workspace.id, email: input.email.toLowerCase() });
    if (existing && existing.status !== "revoked") throw new Error("ALREADY_INVITED");
    const member: Member = {
      id: existing?.id ?? id("member"),
      workspaceId: context.workspace.id,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      role: "reviewer",
      status: "invited",
      invitedAt: new Date().toISOString(),
    };
    await this.transaction(async (session) => {
      await members.updateOne(
        { workspaceId: context.workspace.id, email: member.email },
        { $set: member },
        { upsert: true, session },
      );
      await this.insertAudit(context, "invited", "member", member.id, session);
    });
    return toPlainData(member);
  }

  async revokeReviewer(context: RequestContext, memberId: string) {
    requireOwner(context.member.role);
    await this.transaction(async (session) => {
      const result = await (await col<Member>("members")).updateOne(
        { id: memberId, workspaceId: context.workspace.id, role: "reviewer" },
        { $set: { status: "revoked" } },
        { session },
      );
      if (!result.matchedCount) throw new Error("NOT_FOUND");
      await this.insertAudit(context, "revoked", "member", memberId, session);
    });
  }

  async hardPurge(
    context: RequestContext,
    input: { recordType: RecordType; recordId: string; reason: string },
  ) {
    requireOwner(context.member.role);
    if (!context.workspace.hardDeleteEnabled) throw new Error("HARD_DELETE_DISABLED");
    const bundle = await this.getRecordBundle(context, input.recordType, input.recordId);
    if (!bundle) throw new Error("NOT_FOUND");
    const revisionIds = bundle.revisions.map((item) => item.id);
    const reportCollection = await col<ReportSnapshot>("reportSnapshots");
    const affectedReports = await reportCollection
      .find({ workspaceId: context.workspace.id, recordRevisionIds: { $in: revisionIds } })
      .toArray();
    const tombstone: PurgeTombstone = {
      id: id("purge"),
      workspaceId: context.workspace.id,
      recordType: input.recordType,
      recordId: input.recordId,
      priorHashes: bundle.revisions.map((item) => item.hash),
      reason: input.reason,
      purgedBy: context.member.id,
      purgedAt: new Date().toISOString(),
    };
    const collectionName =
      input.recordType === "care_entry" ? "careEntries" : input.recordType === "appointment" ? "appointments" : "incidents";
    await this.transaction(async (session) => {
      await (await col<Record<string, unknown>>(collectionName)).deleteOne({ id: input.recordId, workspaceId: context.workspace.id }, { session });
      await (await col<RecordRevision>("recordRevisions")).deleteMany(
        { workspaceId: context.workspace.id, id: { $in: revisionIds } },
        { session },
      );
      await (await col<Attachment>("attachments")).deleteMany({ recordId: input.recordId, workspaceId: context.workspace.id }, { session });
      await reportCollection.deleteMany(
        {
          workspaceId: context.workspace.id,
          id: { $in: affectedReports.map((report) => report.id) },
        },
        { session },
      );
      await (await col<PurgeTombstone>("purgeTombstones")).insertOne(tombstone, { session });
      await this.insertAudit(context, "purged", input.recordType, input.recordId, session, {
        revisionCount: revisionIds.length,
        reportCount: affectedReports.length,
      });
    });
    return toPlainData(tombstone);
  }

  async addAttachment(context: RequestContext, attachment: Attachment) {
    requireOwner(context.member.role);
    await this.transaction(async (session) => {
      await (await col<Attachment>("attachments")).insertOne(attachment, { session });
      await this.insertAudit(context, "created", "attachment", attachment.id, session);
    });
  }

  async getAttachment(context: RequestContext, attachmentId: string) {
    const attachment = await (await col<Attachment>("attachments")).findOne({
      id: attachmentId,
      workspaceId: context.workspace.id,
    });
    if (!attachment) return null;
    if (context.member.role === "reviewer" && attachment.recordType === "care_entry") {
      const entry = await (await col<CareEntry>("careEntries")).findOne({
        id: attachment.recordId,
        workspaceId: context.workspace.id,
      });
      if (!entry) return null;
      const log = await (await col<DailyLog>("dailyLogs")).findOne({
        id: entry.dailyLogId,
        workspaceId: context.workspace.id,
        status: "finalized",
      });
      if (!log) return null;
    }
    return toPlainData(attachment);
  }

  async recordAuditEvent(
    context: RequestContext,
    event: Omit<AuditEvent, "id" | "workspaceId" | "occurredAt" | "eventHash">,
  ) {
    await this.insertAudit(context, event.action, event.targetType, event.targetId, undefined, event.metadata, event.previousHash);
  }

  private async bootstrap(identity: Identity) {
    const state = createSeedState(false, identity);
    const client = await getMongoClient();
    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        await (await col<Workspace>("workspaces")).insertOne(state.workspace, { session });
        await (await col<Member>("members")).insertMany(state.members, { session });
        await (await col<Child>("children")).insertMany(state.children, { session });
        await (await col<Caregiver>("caregivers")).insertMany(state.caregivers, { session });
        await (await col<RoutineTemplate>("routineTemplates")).insertMany(state.templates, { session });
        await (await col<DailyLog>("dailyLogs")).insertMany(state.dailyLogs, { session });
        await (await col<AuditEvent>("auditEvents")).insertMany(state.auditEvents, { session });
      });
    });
  }

  private async ensureDailyLog(
    context: RequestContext,
    localDate: string,
    session?: ClientSession,
  ) {
    const logs = await col<DailyLog>("dailyLogs");
    const latestTemplate = await (await col<RoutineTemplate>("routineTemplates")).findOne(
      { workspaceId: context.workspace.id },
      { sort: { version: -1 }, session },
    );
    if (!latestTemplate) throw new Error("ROUTINE_TEMPLATE_NOT_FOUND");
    const existing = await logs.findOne(
      { workspaceId: context.workspace.id, localDate },
      { session },
    );
    if (existing) {
      if (existing.status !== "open" || existing.templateVersion === latestTemplate.version) {
        return existing;
      }
      const hasEntry = await (await col<CareEntry>("careEntries")).findOne(
        {
          workspaceId: context.workspace.id,
          dailyLogId: existing.id,
        },
        { session },
      );
      if (hasEntry) return existing;
      await logs.updateOne(
        { id: existing.id, workspaceId: context.workspace.id, status: "open" },
        { $set: { templateVersion: latestTemplate.version } },
        { session },
      );
      return { ...existing, templateVersion: latestTemplate.version };
    }
    const log: DailyLog = {
      id: id("daily"),
      workspaceId: context.workspace.id,
      localDate,
      templateVersion: latestTemplate.version,
      status: "open",
    };
    try {
      await logs.insertOne(log, { session });
      return log;
    } catch {
      const concurrent = await logs.findOne(
        { workspaceId: context.workspace.id, localDate },
        { session },
      );
      if (!concurrent) throw new Error("DAILY_LOG_CREATE_FAILED");
      return concurrent;
    }
  }

  private initialRevision(
    context: RequestContext,
    recordType: RevisionRecordType,
    recordId: string,
    payload: Record<string, unknown>,
    recordedAt: string,
  ): RecordRevision {
    return {
      id: id("rev"),
      workspaceId: context.workspace.id,
      recordType,
      recordId,
      revisionNumber: 1,
      payload,
      reason: "Initial record",
      authorId: context.member.id,
      recordedAt,
      hash: createRevisionHash({ payload, authorId: context.member.id, recordedAt }),
    };
  }

  private async getArrangementReferences(context: RequestContext) {
    const [children, caregivers, templates] = await Promise.all([
      (await col<Child>("children"))
        .find({ workspaceId: context.workspace.id, active: true })
        .toArray(),
      (await col<Caregiver>("caregivers"))
        .find({ workspaceId: context.workspace.id, active: true })
        .toArray(),
      (await col<RoutineTemplate>("routineTemplates"))
        .find({ workspaceId: context.workspace.id })
        .toArray(),
    ]);
    return {
      childIds: new Set(children.map((child) => child.id)),
      caregiverIds: new Set(caregivers.map((caregiver) => caregiver.id)),
      routineIds: new Set(
        templates.flatMap((template) => template.items.map((item) => item.id)),
      ),
    };
  }

  private async insertAudit(
    context: RequestContext,
    action: AuditEvent["action"],
    targetType: string,
    targetId: string,
    session?: ClientSession,
    metadata?: Record<string, string | number | boolean>,
    suppliedPreviousHash?: string,
  ) {
    const audits = await col<AuditEvent>("auditEvents");
    const previous = await audits.findOne(
      { workspaceId: context.workspace.id },
      { sort: { occurredAt: -1 }, session },
    );
    const occurredAt = new Date().toISOString();
    const base = { actorId: context.member.id, action, targetType, targetId, occurredAt, metadata };
    const previousHash = suppliedPreviousHash ?? previous?.eventHash;
    await audits.insertOne(
      {
        id: id("audit"),
        workspaceId: context.workspace.id,
        ...base,
        previousHash,
        eventHash: createAuditHash({ event: base, previousHash }),
      },
      { session },
    );
  }

  private async findRecord(workspaceId: string, type: RecordType, idValue: string) {
    if (type === "care_entry")
      return (await col<CareEntry>("careEntries")).findOne({ id: idValue, workspaceId });
    if (type === "appointment")
      return (await col<Appointment>("appointments")).findOne({ id: idValue, workspaceId });
    return (await col<Incident>("incidents")).findOne({ id: idValue, workspaceId });
  }

  private async transaction(work: (session: ClientSession) => Promise<void>) {
    const client = await getMongoClient();
    await client.withSession(async (session) => {
      await session.withTransaction(() => work(session));
    });
  }
}
