import "server-only";

import {
  accountDeletionStarted,
  beginAccountDeletionFence,
  claimAccountBootstrap,
  claimAccountMutation,
} from "@/lib/account/deletion-state";
import type { ClientSession, Collection, Document } from "mongodb";

import { collection, ensureMongoIndexes, getMongoClient } from "@/lib/db/mongodb";
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
  Caregiver,
  Child,
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
  DailyLogNotesInput,
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
import { toPlainData } from "./to-plain-data";
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
import type {
  AgentConfirmation,
  AgentOperationReceipt,
} from "@/lib/agents/types";

type AppDocument<T> = T & Document;

interface RoutineRecordSlot {
  id: string;
  workspaceId: string;
  routineSlotKey: string;
  dailyLogId: string;
  templateItemId: string;
  careEntryId: string;
  createdAt: string;
}

/**
 * Repository-internal sequence used to make every open-day write contend on
 * the daily-log document. It is deliberately excluded from dayVersionFor so a
 * write only changes the public version when its user-visible payload commits.
 */
type StoredDailyLog = DailyLog & { _writeSequence?: number };

function toDomainDailyLog(log: StoredDailyLog): DailyLog {
  return {
    id: log.id,
    workspaceId: log.workspaceId,
    localDate: log.localDate,
    templateVersion: log.templateVersion,
    status: log.status,
    ...(log.notes !== undefined ? { notes: log.notes } : {}),
    ...(log.finalizedAt !== undefined ? { finalizedAt: log.finalizedAt } : {}),
    ...(log.finalizedBy !== undefined ? { finalizedBy: log.finalizedBy } : {}),
  };
}

async function col<T>(name: string): Promise<Collection<AppDocument<T>>> {
  return collection<AppDocument<T>>(name);
}

async function assertActiveRecordReferences(
  context: RequestContext,
  childIds: string[],
  caregiverIds: string[],
  session: ClientSession,
): Promise<void> {
  const [children, caregivers] = await Promise.all([
    childIds.length
      ? (await col<Child>("children"))
          .find(
            {
              workspaceId: context.workspace.id,
              id: { $in: [...new Set(childIds)] },
              active: true,
            },
            { projection: { id: 1 }, session },
          )
          .toArray()
      : [],
    caregiverIds.length
      ? (await col<Caregiver>("caregivers"))
          .find(
            {
              workspaceId: context.workspace.id,
              id: { $in: [...new Set(caregiverIds)] },
              active: true,
            },
            { projection: { id: 1 }, session },
          )
          .toArray()
      : [],
  ]);
  assertActiveReferenceIds(
    childIds,
    new Set(children.map((child) => child.id)),
    "INVALID_CHILD_REFERENCE",
  );
  assertActiveReferenceIds(
    caregiverIds,
    new Set(caregivers.map((caregiver) => caregiver.id)),
    "INVALID_CAREGIVER_REFERENCE",
  );
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

  async resolveContext(
    identity: Identity,
    options: { allowAccountDeletion?: boolean } = {},
  ): Promise<RequestContext> {
    await this.ensureReady();
    if (
      !options.allowAccountDeletion &&
      (await accountDeletionStarted(identity.authUserId))
    ) {
      throw new Error("ACCOUNT_DELETION_IN_PROGRESS");
    }
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
      const revoked = await members.findOne({
        status: "revoked",
        $or: [
          { authUserId: identity.authUserId },
          { email: normalizedEmail },
        ],
      });
      if (revoked) throw new Error("FORBIDDEN");
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
      const pendingMember = member;
      let activated = false;
      await this.transaction(async (session) => {
        await claimAccountMutation(
          identity.authUserId,
          pendingMember.workspaceId,
          session,
        );
        const result = await members.updateOne(
          {
            id: pendingMember.id,
            workspaceId: pendingMember.workspaceId,
            status: { $ne: "revoked" },
            $or: [
              { authUserId: identity.authUserId },
              { authUserId: { $exists: false } },
            ],
          },
          { $set: { status: "active", authUserId: identity.authUserId } },
          { session },
        );
        activated = Boolean(result.matchedCount);
      });
      if (!activated) throw new Error("FORBIDDEN");
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

  async getOperationResult<T>(context: RequestContext) {
    return this.operationReplay<T>(context);
  }

  async recordOperationResult<T>(context: RequestContext, result: T): Promise<T> {
    return this.operationMutation(context, async () => result);
  }

  async getDashboard(
    context: RequestContext,
    date: string,
    createIfMissing = true,
  ) {
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
    const dailyLog =
      context.member.role === "reviewer"
        ? await (await col<DailyLog>("dailyLogs")).findOne({
            workspaceId: context.workspace.id,
            localDate: date,
            status: "finalized",
          })
        : createIfMissing
          ? await this.ensureDailyLog(context, date)
          : await (await col<DailyLog>("dailyLogs")).findOne({
              workspaceId: context.workspace.id,
              localDate: date,
            });
    if (!dailyLog) throw new Error("NOT_FOUND");
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
    const recorded = tasks.filter((task) => Boolean(task.entry)).length;
    return toPlainData({
      workspace: context.workspace,
      member: context.member,
      date,
      dailyLog: toDomainDailyLog(dailyLog),
      children,
      caregivers,
      tasks,
      specialArrangement: specialArrangement ?? undefined,
      completion: {
        recorded,
        total: tasks.length,
        percent: tasks.length ? Math.round((recorded / tasks.length) * 100) : 0,
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

  async getIncidentsData(context: RequestContext): Promise<IncidentsData> {
    const [incidents, attachments] = await Promise.all([
      this.getIncidents(context),
      (await col<Attachment>("attachments"))
        .find({ workspaceId: context.workspace.id, recordType: "incident" })
        .sort({ uploadedAt: 1 })
        .toArray(),
    ]);
    return toPlainData({ incidents, attachments });
  }

  async getReports(context: RequestContext) {
    return toPlainData(
      await (await col<ReportSnapshot>("reportSnapshots"))
        .find({ workspaceId: context.workspace.id })
        .sort({ createdAt: -1 })
        .toArray(),
    );
  }

  async getSettings(
    context: RequestContext,
    session?: ClientSession,
  ): Promise<SettingsData> {
    const [members, children, caregivers, template] = await Promise.all([
      (await col<Member>("members"))
        .find({ workspaceId: context.workspace.id }, { session })
        .toArray(),
      (await col<Child>("children"))
        .find(
          { workspaceId: context.workspace.id, active: true },
          { session },
        )
        .sort({ sortOrder: 1 })
        .toArray(),
      (await col<Caregiver>("caregivers"))
        .find({ workspaceId: context.workspace.id }, { session })
        .toArray(),
      (await col<RoutineTemplate>("routineTemplates")).findOne(
        { workspaceId: context.workspace.id },
        { sort: { version: -1 }, session },
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

  async getSpecialArrangement(
    context: RequestContext,
    recordId: string,
  ): Promise<VersionedSpecialArrangement | null> {
    requireOwner(context.member.role);
    const arrangement = await (
      await col<SpecialArrangementDay>("specialArrangementDays")
    ).findOne({ id: recordId, workspaceId: context.workspace.id });
    if (!arrangement) return null;
    const revision = await (
      await col<RecordRevision>("recordRevisions")
    ).findOne({
      id: arrangement.currentRevisionId,
      workspaceId: context.workspace.id,
    });
    if (!revision) throw new Error("REVISION_NOT_FOUND");
    return toPlainData({ ...arrangement, recordVersion: revision.hash });
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

  async getDayVersion(context: RequestContext, localDate: string) {
    const log = await (await col<DailyLog>("dailyLogs")).findOne({
      workspaceId: context.workspace.id,
      localDate,
      ...(context.member.role === "reviewer" ? { status: "finalized" } : {}),
    });
    if (!log) throw new Error("NOT_FOUND");
    const [entries, specialArrangement] = await Promise.all([
      (await col<CareEntry>("careEntries"))
        .find({ workspaceId: context.workspace.id, dailyLogId: log.id })
        .toArray(),
      (await col<SpecialArrangementDay>("specialArrangementDays")).findOne({
        workspaceId: context.workspace.id,
        dailyLogId: log.id,
        status: "active",
      }),
    ]);
    const revisionIds = [
      ...entries.map((entry) => entry.currentRevisionId),
      ...(specialArrangement ? [specialArrangement.currentRevisionId] : []),
    ];
    const revisions = revisionIds.length
      ? await (await col<RecordRevision>("recordRevisions"))
          .find({ workspaceId: context.workspace.id, id: { $in: revisionIds } })
          .toArray()
      : [];
    return dayVersionFor(
      toPlainData(log),
      toPlainData(entries),
      toPlainData(revisions),
      toPlainData(specialArrangement),
    );
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
    await this.operationMutation(context, async (session) => {
      await (await col<AgentConfirmation>("agentConfirmations")).insertOne(
        confirmation,
        { session },
      );
      return this.redactConfirmationHandle(result);
    });
    return result;
  }

  async getAgentConfirmation(context: RequestContext, tokenHash: string) {
    const confirmation = await (
      await col<AgentConfirmation>("agentConfirmations")
    ).findOne({
      tokenHash,
      workspaceId: context.workspace.id,
      memberId: context.member.id,
      oauthClientId: context.agent?.oauthClientId,
    });
    return confirmation ?? null;
  }

  async getReportSource(
    context: RequestContext,
    reportId: string,
  ): Promise<ReportSource | null> {
    const [snapshot, evidence] = await Promise.all([
      (await col<ReportSnapshot>("reportSnapshots")).findOne({
        id: reportId,
        workspaceId: context.workspace.id,
      }),
      (await col<ReportEvidenceSnapshot>("reportEvidenceSnapshots")).findOne({
        reportId,
        workspaceId: context.workspace.id,
      }),
    ]);
    if (!snapshot || !evidence) return null;
    const captured = toPlainData(evidence);
    return {
      snapshot: toPlainData(snapshot),
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
    const replay = await this.operationReplay<CareEntryWriteResult>(context);
    if (replay.found) return replay.result;
    const log = await this.ensureDailyLog(context, input.localDate);
    if (log.status !== "open") throw new Error("DAY_FINALIZED");
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
    assertValidCareEntryDetails(normalizedInput);
    const findExistingRoutine = async (
      session?: ClientSession,
    ): Promise<CareEntryWriteResult | null> => {
      if (!normalizedInput.templateItemId) return null;
      const existing = await (await col<CareEntry>("careEntries")).findOne(
        {
          workspaceId: context.workspace.id,
          dailyLogId: log.id,
          templateItemId: normalizedInput.templateItemId,
        },
        { sort: { occurredAt: -1, recordedAt: -1 }, session },
      );
      if (!existing) return null;
      const currentRevision = await (
        await col<RecordRevision>("recordRevisions")
      ).findOne(
        {
          workspaceId: context.workspace.id,
          id: existing.currentRevisionId,
        },
        { session },
      );
      if (!currentRevision) throw new Error("REVISION_NOT_FOUND");
      return toPlainData({
        ...existing,
        recordVersion: currentRevision.hash,
        writeDisposition: "existing" as const,
      });
    };
    const existingRoutine = await findExistingRoutine();
    if (existingRoutine) {
      return this.operationMutation(context, async (session) => {
        await this.claimOpenDailyLog(
          context,
          log.id,
          "VERSION_CONFLICT",
          session,
        );
        const current = await findExistingRoutine(session);
        if (!current) throw new Error("REVISION_NOT_FOUND");
        return current;
      });
    }
    const recordedAt = new Date().toISOString();
    const recordId = id("care");
    const revisionPayload: Record<string, unknown> = { ...normalizedInput };
    for (const field of ["durationMinutes", "activityType", "notes"] as const) {
      if (normalizedInput[field] === undefined) delete revisionPayload[field];
    }
    const revision = this.initialRevision(
      context,
      "care_entry",
      recordId,
      revisionPayload,
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
    for (const field of ["durationMinutes", "activityType", "notes"] as const) {
      if (entry[field] === undefined) delete entry[field];
    }
    try {
      return await this.operationMutation(context, async (session) => {
        await this.claimOpenDailyLog(
          context,
          log.id,
          "VERSION_CONFLICT",
          session,
        );
        if (normalizedInput.templateItemId) {
          const routineSlotKey = sha256(
            canonicalJson({
              dailyLogId: log.id,
              templateItemId: normalizedInput.templateItemId,
            }),
          );
          await (
            await col<RoutineRecordSlot>("routineRecordSlots")
          ).insertOne(
            {
              id: id("routine_slot"),
              workspaceId: context.workspace.id,
              routineSlotKey,
              dailyLogId: log.id,
              templateItemId: normalizedInput.templateItemId,
              careEntryId: entry.id,
              createdAt: recordedAt,
            },
            { session },
          );
        }
        await (await col<CareEntry>("careEntries")).insertOne(entry, { session });
        await (await col<RecordRevision>("recordRevisions")).insertOne(revision, {
          session,
        });
        await this.insertAudit(context, "created", "care_entry", entry.id, session);
        return toPlainData({
          ...entry,
          recordVersion: revision.hash,
          writeDisposition: "created" as const,
        });
      });
    } catch (error) {
      const duplicateKey =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000;
      if (!duplicateKey || !normalizedInput.templateItemId) throw error;
      return this.operationMutation(context, async (session) => {
        await this.claimOpenDailyLog(
          context,
          log.id,
          "VERSION_CONFLICT",
          session,
        );
        const concurrent = await findExistingRoutine(session);
        if (!concurrent) throw error;
        return concurrent;
      });
    }
  }

  async updateCareEntry(context: RequestContext, input: CareEntryUpdateInput) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<VersionedCareEntry>(context);
    if (replay.found) return replay.result;
    assertValidCareEntryDetails(input);
    const entry = await (await col<CareEntry>("careEntries")).findOne({
      id: input.recordId,
      workspaceId: context.workspace.id,
    });
    if (!entry) throw new Error("NOT_FOUND");
    const revision = await (await col<RecordRevision>("recordRevisions")).findOne({
      id: entry.currentRevisionId,
      workspaceId: context.workspace.id,
    });
    if (!revision) throw new Error("REVISION_NOT_FOUND");
    if (
      context.operation?.expectedRecordVersion &&
      context.operation.expectedRecordVersion !== revision.hash
    ) {
      throw new Error("VERSION_CONFLICT");
    }
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

    return this.operationMutation(context, async (session) => {
      await this.claimOpenDailyLog(
        context,
        entry.dailyLogId,
        "VERSION_CONFLICT",
        session,
      );
      const revisionUpdate = await (
        await col<RecordRevision>("recordRevisions")
      ).updateOne(
        {
          id: revision.id,
          workspaceId: context.workspace.id,
          hash: revision.hash,
        },
        { $set: { payload, authorId: context.member.id, recordedAt: savedAt, hash } },
        { session },
      );
      if (!revisionUpdate.matchedCount) throw new Error("VERSION_CONFLICT");
      const entryUpdate = await (await col<CareEntry>("careEntries")).updateOne(
        {
          id: entry.id,
          workspaceId: context.workspace.id,
          currentRevisionId: revision.id,
        },
        {
          $set: setFields,
          ...(Object.keys(unsetFields).length ? { $unset: unsetFields } : {}),
        },
        { session },
      );
      if (!entryUpdate.matchedCount) throw new Error("VERSION_CONFLICT");
      await this.insertAudit(context, "updated", "care_entry", entry.id, session, {
        revisionNumber: revision.revisionNumber,
      });
      return toPlainData({
        ...entry,
        ...update,
        occurredAt,
        lateEntry,
        recordVersion: hash,
      });
    });
  }

  async correctCareEntry(context: RequestContext, input: CareEntryCorrectionInput) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<RecordRevision>(context);
    if (replay.found) return replay.result;
    assertValidCareEntryDetails(input);
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
    const previous = await (await col<RecordRevision>("recordRevisions")).findOne({
      id: entry.currentRevisionId,
      workspaceId: context.workspace.id,
    });
    if (!previous) throw new Error("REVISION_NOT_FOUND");
    if (
      context.operation?.expectedRecordVersion &&
      context.operation.expectedRecordVersion !== previous.hash
    ) {
      throw new Error("CONFIRMATION_STALE");
    }

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
    for (const field of ["durationMinutes", "activityType", "notes"] as const) {
      if (correction[field] === undefined) delete payload[field];
    }
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

    return this.operationMutation(context, async (session) => {
      await this.consumeAgentConfirmation(
        context,
        entry.id,
        previous.hash,
        session,
      );
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      const entryUpdate = await (await col<CareEntry>("careEntries")).updateOne(
        {
          id: entry.id,
          workspaceId: context.workspace.id,
          currentRevisionId: previous.id,
        },
        {
          $set: setFields,
          ...(Object.keys(unsetFields).length ? { $unset: unsetFields } : {}),
        },
        { session },
      );
      if (!entryUpdate.matchedCount) throw new Error("CONFIRMATION_STALE");
      await this.insertAudit(
        context,
        "corrected",
        "care_entry",
        entry.id,
        session,
        { revisionNumber: revision.revisionNumber },
      );
      return toPlainData(revision);
    });
  }

  async createAppointment(context: RequestContext, input: AppointmentInput) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<Appointment>(context);
    if (replay.found) return replay.result;
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
    return this.operationMutation(context, async (session) => {
      await assertActiveRecordReferences(
        context,
        input.childIds,
        input.responsibleCaregiverIds,
        session,
      );
      await (await col<Appointment>("appointments")).insertOne(appointment, { session });
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await this.insertAudit(context, "created", "appointment", recordId, session);
      return toPlainData(appointment);
    });
  }

  async createIncident(context: RequestContext, input: IncidentInput) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<Incident>(context);
    if (replay.found) return replay.result;
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
    return this.operationMutation(context, async (session) => {
      await assertActiveRecordReferences(context, input.childIds, [], session);
      await (await col<Incident>("incidents")).insertOne(incident, { session });
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await this.insertAudit(context, "created", "incident", recordId, session);
      return toPlainData(incident);
    });
  }

  async correctRecord(context: RequestContext, input: CorrectionInput) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<RecordRevision>(context);
    if (replay.found) return replay.result;
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
    if (
      context.operation?.expectedRecordVersion &&
      context.operation.expectedRecordVersion !== previous.hash
    ) {
      throw new Error("VERSION_CONFLICT");
    }
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
    return this.operationMutation(context, async (session) => {
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      const updated = await (await col<Record<string, unknown>>(collectionName)).updateOne(
        {
          id: input.recordId,
          workspaceId: context.workspace.id,
          currentRevisionId: previous.id,
        },
        { $set: { currentRevisionId: revision.id, [correctedField]: input.correctedText } },
        { session },
      );
      if (!updated.matchedCount) throw new Error("VERSION_CONFLICT");
      await this.insertAudit(context, "corrected", input.recordType, input.recordId, session, {
        revisionNumber: revision.revisionNumber,
      });
      return toPlainData(revision);
    });
  }

  async updateDailyLogNotes(
    context: RequestContext,
    input: DailyLogNotesInput,
  ) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<VersionedDailyLog>(context);
    if (replay.found) return replay.result;
    const log = await this.ensureDailyLog(context, input.localDate);
    return this.operationMutation(context, async (session) => {
      const { log: currentLog } = await this.claimOpenDailyLog(
        context,
        log.id,
        "VERSION_CONFLICT",
        session,
      );
      const update = input.notes
        ? { $set: { notes: input.notes } }
        : { $unset: { notes: "" } };
      const openLog = await (await col<DailyLog>("dailyLogs")).updateOne(
        {
          id: log.id,
          workspaceId: context.workspace.id,
          status: "open",
        },
        update,
        { session },
      );
      if (!openLog.matchedCount) throw new Error("DAY_FINALIZED");
      await this.insertAudit(context, "updated", "daily_log", log.id, session);
      const resultLog = {
        ...toDomainDailyLog(currentLog),
        notes: input.notes || undefined,
      };
      return toPlainData({
        ...resultLog,
        dayVersion: await this.calculateDayVersion(
          context,
          resultLog,
          session,
        ),
      });
    });
  }

  async finalizeDailyLog(context: RequestContext, localDate: string) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<VersionedDailyLog>(context);
    if (replay.found) return replay.result;
    const log = await this.ensureDailyLog(context, localDate);
    const finalizedAt = new Date().toISOString();
    return this.operationMutation(context, async (session) => {
      const { log: currentLog, version: currentVersion } =
        await this.assertDayVersion(
          context,
          log.id,
          "CONFIRMATION_STALE",
          session,
        );
      await this.consumeAgentConfirmation(
        context,
        currentLog.id,
        currentVersion,
        session,
      );
      if (currentLog.status === "finalized") {
        return toPlainData({
          ...toDomainDailyLog(currentLog),
          dayVersion: currentVersion,
        });
      }
      const finalized = await (await col<DailyLog>("dailyLogs")).updateOne(
        {
          id: currentLog.id,
          workspaceId: context.workspace.id,
          status: "open",
        },
        { $set: { status: "finalized", finalizedAt, finalizedBy: context.member.id } },
        { session },
      );
      if (!finalized.matchedCount) throw new Error("CONFIRMATION_STALE");
      await this.insertAudit(
        context,
        "finalized",
        "daily_log",
        currentLog.id,
        session,
      );
      const resultLog = {
        ...toDomainDailyLog(currentLog),
        status: "finalized" as const,
        finalizedAt,
        finalizedBy: context.member.id,
      };
      return toPlainData({
        ...resultLog,
        dayVersion: await this.calculateDayVersion(
          context,
          resultLog,
          session,
        ),
      });
    });
  }

  async createSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementCreateInput,
  ) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<SpecialArrangementDay[]>(context);
    if (replay.found) return replay.result;
    const references = await this.getArrangementReferences(context);
    const seriesId = id("arrangement_series");
    const createdAt = new Date().toISOString();
    try {
      return await this.operationMutation(context, async (session) => {
        const created: SpecialArrangementDay[] = [];
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
          await this.claimOpenDailyLog(
            context,
            dailyLog.id,
            "VERSION_CONFLICT",
            session,
          );
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
        return toPlainData(created);
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
  }

  async updateSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementUpdateInput,
  ) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<VersionedSpecialArrangement>(
      context,
    );
    if (replay.found) return replay.result;
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
    if (
      context.operation?.expectedRecordVersion &&
      context.operation.expectedRecordVersion !== revision.hash
    ) {
      throw new Error("VERSION_CONFLICT");
    }
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
    return this.operationMutation(context, async (session) => {
      await this.claimOpenDailyLog(
        context,
        arrangement.dailyLogId,
        "VERSION_CONFLICT",
        session,
      );
      const revisionResult = await (
        await col<RecordRevision>("recordRevisions")
      ).updateOne(
        {
          id: revision.id,
          workspaceId: context.workspace.id,
          hash: revision.hash,
        },
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
      if (!revisionResult.matchedCount) throw new Error("VERSION_CONFLICT");
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
      return toPlainData({
        ...arrangement,
        ...fields,
        updatedAt,
        recordVersion: hash,
      });
    });
  }

  async correctSpecialArrangement(
    context: RequestContext,
    input: SpecialArrangementCorrectionInput,
  ) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<RecordRevision>(context);
    if (replay.found) return replay.result;
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
    if (
      context.operation?.expectedRecordVersion &&
      context.operation.expectedRecordVersion !== previous.hash
    ) {
      throw new Error("VERSION_CONFLICT");
    }
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
    return this.operationMutation(context, async (session) => {
      await this.claimFinalizedDailyLog(
        context,
        arrangement.dailyLogId,
        session,
      );
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
      return toPlainData(revision);
    });
  }

  async createReport(context: RequestContext, input: ReportInput) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<ReportSnapshot>(context);
    if (replay.found) return replay.result;
    return this.operationMutation(context, async (session) => {
      const [workspace, finalizedLogs, children, caregivers, allEntries, allAppointments, allIncidents, allArrangements] =
        await Promise.all([
          (await col<Workspace>("workspaces")).findOne(
            { id: context.workspace.id },
            { session },
          ),
          (await col<DailyLog>("dailyLogs"))
            .find(
              { workspaceId: context.workspace.id, status: "finalized" },
              { session },
            )
            .toArray(),
          (await col<Child>("children"))
            .find({ workspaceId: context.workspace.id }, { session })
            .sort({ sortOrder: 1 })
            .toArray(),
          (await col<Caregiver>("caregivers"))
            .find({ workspaceId: context.workspace.id }, { session })
            .toArray(),
          (await col<CareEntry>("careEntries"))
            .find({ workspaceId: context.workspace.id }, { session })
            .toArray(),
          (await col<Appointment>("appointments"))
            .find({ workspaceId: context.workspace.id }, { session })
            .toArray(),
          (await col<Incident>("incidents"))
            .find({ workspaceId: context.workspace.id }, { session })
            .toArray(),
          (await col<SpecialArrangementDay>("specialArrangementDays"))
            .find({ workspaceId: context.workspace.id }, { session })
            .toArray(),
        ]);
      if (!workspace) throw new Error("NOT_FOUND");
      const finalizedLogIds = new Set(finalizedLogs.map((log) => log.id));
      const includesChildren = (childIds: string[]) =>
        input.childIds.length === 0 ||
        childIds.some((childId) => input.childIds.includes(childId));
      const inRange = (dateTime: string) => {
        const localDate = dateTime.slice(0, 10);
        return localDate >= input.from && localDate <= input.to;
      };
      const entries = input.includeCare
        ? allEntries
            .filter(
              (entry) =>
                finalizedLogIds.has(entry.dailyLogId) &&
                inRange(entry.occurredAt) &&
                includesChildren(entry.childIds),
            )
            .map((entry) =>
              withCurrentLateEntryStatus(entry, workspace.timezone),
            )
        : [];
      const appointments = input.includeAppointments
        ? allAppointments.filter(
            (appointment) =>
              inRange(appointment.scheduledAt) &&
              includesChildren(appointment.childIds),
          )
        : [];
      const incidents = input.includeIncidents
        ? allIncidents.filter(
            (incident) =>
              inRange(incident.occurredAt) &&
              includesChildren(incident.childIds),
          )
        : [];
      const arrangements = allArrangements
        .filter(
          (arrangement) =>
            arrangement.status === "active" &&
            finalizedLogIds.has(arrangement.dailyLogId) &&
            arrangement.localDate >= input.from &&
            arrangement.localDate <= input.to &&
            includesChildren(
              arrangement.assignments.map((assignment) => assignment.childId),
            ),
        )
        .map((arrangement) =>
          arrangementForChildren(arrangement, input.childIds),
        );
      const recordIds = [
        ...entries.map((entry) => entry.id),
        ...appointments.map((appointment) => appointment.id),
        ...incidents.map((incident) => incident.id),
        ...arrangements.map((arrangement) => arrangement.id),
      ];
      const revisions = recordIds.length
        ? await (await col<RecordRevision>("recordRevisions"))
            .find(
              {
                workspaceId: context.workspace.id,
                recordId: { $in: recordIds },
              },
              { session },
            )
            .sort({ recordType: 1, recordId: 1, revisionNumber: 1 })
            .toArray()
        : [];
      assertReportRevisionCoverage(
        [...entries, ...appointments, ...incidents, ...arrangements],
        revisions,
      );
      const revisionIds = revisions.map((revision) => revision.id);
      const attachments = revisionIds.length
        ? await (await col<Attachment>("attachments"))
            .find(
              {
                workspaceId: context.workspace.id,
                revisionId: { $in: revisionIds },
              },
              { session },
            )
            .sort({ uploadedAt: 1, id: 1 })
            .toArray()
        : [];
      const reportId = id("report");
      const createdAt = new Date().toISOString();
      const report: ReportSnapshot = {
        id: reportId,
        workspaceId: context.workspace.id,
        createdBy: context.member.id,
        createdAt,
        status: "pending",
        filters: input,
        recordRevisionIds: revisionIds,
        attachmentIds: attachments.map((attachment) => attachment.id),
        ...reportArtifactPathnames(context.workspace.id, reportId),
      };
      const evidence: ReportEvidenceSnapshot = {
        reportId,
        workspaceId: context.workspace.id,
        capturedAt: createdAt,
        workspace,
        children,
        caregivers,
        entries,
        appointments,
        incidents,
        arrangements,
        revisions,
        attachments,
      };
      await (await col<ReportSnapshot>("reportSnapshots")).insertOne(report, {
        session,
      });
      await (
        await col<ReportEvidenceSnapshot>("reportEvidenceSnapshots")
      ).insertOne(evidence, { session });
      return toPlainData(report);
    });
  }

  async retryReportGeneration(
    context: RequestContext,
    reportId: string,
  ): Promise<ReportSnapshot> {
    let report!: ReportSnapshot;
    await this.transaction(async (session) => {
      await claimAccountMutation(
        context.identity.authUserId,
        context.workspace.id,
        session,
      );
      await (await col<ReportSnapshot>("reportSnapshots")).updateOne(
        {
          id: reportId,
          workspaceId: context.workspace.id,
          status: "failed",
        },
        {
          $set: { status: "pending" },
          $unset: { error: "", workflowRunId: "" },
        },
        { session },
      );
      const current = await (await col<ReportSnapshot>("reportSnapshots")).findOne(
        { id: reportId, workspaceId: context.workspace.id },
        { session },
      );
      if (!current) throw new Error("NOT_FOUND");
      report = toPlainData(current);
    });
    return report;
  }

  async markReportScheduled(
    context: RequestContext,
    reportId: string,
    workflowRunId: string,
  ): Promise<ReportSnapshot> {
    let report!: ReportSnapshot;
    await this.transaction(async (session) => {
      await claimAccountMutation(
        context.identity.authUserId,
        context.workspace.id,
        session,
      );
      await (await col<ReportSnapshot>("reportSnapshots")).updateOne(
        {
          id: reportId,
          workspaceId: context.workspace.id,
          status: "pending",
          workflowRunId: { $exists: false },
        },
        { $set: { workflowRunId } },
        { session },
      );
      const current = await (await col<ReportSnapshot>("reportSnapshots")).findOne(
        { id: reportId, workspaceId: context.workspace.id },
        { session },
      );
      if (!current) throw new Error("NOT_FOUND");
      report = toPlainData(current);
    });
    return report;
  }

  async markReportReady(
    context: RequestContext,
    reportId: string,
    artifacts: { manifestHash: string; pdfPathname: string; zipPathname: string; workflowRunId?: string },
  ) {
    await this.transaction(async (session) => {
      await claimAccountMutation(
        context.identity.authUserId,
        context.workspace.id,
        session,
      );
      const reports = await col<ReportSnapshot>("reportSnapshots");
      const result = await reports.updateOne(
        {
          id: reportId,
          workspaceId: context.workspace.id,
          status: { $ne: "ready" },
        },
        { $set: { ...artifacts, status: "ready" }, $unset: { error: "" } },
        { session },
      );
      if (result.modifiedCount) {
        await this.insertAudit(
          context,
          "report_generated",
          "report",
          reportId,
          session,
        );
        return;
      }
      const existing = await reports.findOne(
        { id: reportId, workspaceId: context.workspace.id },
        { session },
      );
      if (!existing) throw new Error("NOT_FOUND");
    });
  }

  async markReportFailed(context: RequestContext, reportId: string, error: string) {
    await this.transaction(async (session) => {
      await claimAccountMutation(
        context.identity.authUserId,
        context.workspace.id,
        session,
      );
      await (await col<ReportSnapshot>("reportSnapshots")).updateOne(
        {
          id: reportId,
          workspaceId: context.workspace.id,
          status: { $ne: "ready" },
        },
        { $set: { status: "failed", error } },
        { session },
      );
    });
  }

  async updateSettings(context: RequestContext, input: WorkspaceSettingsInput) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<SettingsData>(context);
    if (replay.found) {
      context.workspace = replay.result.workspace;
      return replay.result;
    }
    const nextWorkspace = {
      ...context.workspace,
      name: input.name,
      timezone: input.timezone,
      hardDeleteEnabled: input.hardDeleteEnabled,
      updatedAt: new Date().toISOString(),
    };
    const result = await this.operationMutation(context, async (session) => {
      await (await col<Workspace>("workspaces")).updateOne(
        { id: context.workspace.id },
        {
          $set: {
            name: nextWorkspace.name,
            timezone: nextWorkspace.timezone,
            hardDeleteEnabled: nextWorkspace.hardDeleteEnabled,
            updatedAt: nextWorkspace.updatedAt,
          },
        },
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
      return this.getSettings(
        { ...context, workspace: nextWorkspace },
        session,
      );
    });
    context.workspace = result.workspace;
    return result;
  }

  async inviteReviewer(context: RequestContext, input: { email: string; displayName: string }) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<Member>(context);
    if (replay.found) return replay.result;
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
    return this.operationMutation(context, async (session) => {
      await members.updateOne(
        { workspaceId: context.workspace.id, email: member.email },
        { $set: member },
        { upsert: true, session },
      );
      await this.insertAudit(context, "invited", "member", member.id, session);
      return toPlainData(member);
    });
  }

  async revokeReviewer(context: RequestContext, memberId: string) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<null>(context);
    if (replay.found) return;
    await this.operationMutation(context, async (session) => {
      const result = await (await col<Member>("members")).updateOne(
        { id: memberId, workspaceId: context.workspace.id, role: "reviewer" },
        { $set: { status: "revoked" } },
        { session },
      );
      if (!result.matchedCount) throw new Error("NOT_FOUND");
      await this.insertAudit(context, "revoked", "member", memberId, session);
      return null;
    });
  }

  async hardPurge(
    context: RequestContext,
    input: { recordType: RecordType; recordId: string; reason: string },
  ) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<PurgeTombstone>(context);
    if (replay.found) return replay.result;
    const bundle = await this.getRecordBundle(context, input.recordType, input.recordId);
    if (!bundle) {
      const priorPurge = await (
        await col<PurgeTombstone>("purgeTombstones")
      ).findOne({
        workspaceId: context.workspace.id,
        recordType: input.recordType,
        recordId: input.recordId,
      });
      if (!priorPurge) throw new Error("NOT_FOUND");
      return this.operationMutation(context, async () =>
        toPlainData(priorPurge),
      );
    }
    if (!context.workspace.hardDeleteEnabled) throw new Error("HARD_DELETE_DISABLED");
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
    const collectionName =
      input.recordType === "care_entry" ? "careEntries" : input.recordType === "appointment" ? "appointments" : "incidents";
    return this.operationMutation(context, async (session) => {
      await (await col<Record<string, unknown>>(collectionName)).deleteOne({ id: input.recordId, workspaceId: context.workspace.id }, { session });
      if (input.recordType === "care_entry") {
        await (await col<RoutineRecordSlot>("routineRecordSlots")).deleteMany(
          { workspaceId: context.workspace.id, careEntryId: input.recordId },
          { session },
        );
      }
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
      await (await col<ReportEvidenceSnapshot>("reportEvidenceSnapshots")).deleteMany(
        {
          workspaceId: context.workspace.id,
          reportId: { $in: affectedReports.map((report) => report.id) },
        },
        { session },
      );
      await (await col<PurgeTombstone>("purgeTombstones")).insertOne(tombstone, { session });
      await this.insertAudit(context, "purged", input.recordType, input.recordId, session, {
        revisionCount: revisionIds.length,
        reportCount: affectedReports.length,
      });
      return toPlainData(tombstone);
    });
  }

  async beginAccountDeletion(context: RequestContext): Promise<void> {
    const client = await getMongoClient();
    await client.withSession(async (session) => {
      await session.withTransaction(() =>
        beginAccountDeletionFence(
          context.identity.authUserId,
          context.workspace.id,
          context.member.role === "owner",
          session,
        ),
      );
    });
  }

  async getAccountDeletionPaths(context: RequestContext): Promise<string[]> {
    if (context.member.role !== "owner") return [];
    const [attachments, reports] = await Promise.all([
      (await col<Attachment>("attachments"))
        .find({ workspaceId: context.workspace.id })
        .project<{ pathname: string }>({ pathname: 1, _id: 0 })
        .toArray(),
      (await col<ReportSnapshot>("reportSnapshots"))
        .find({ workspaceId: context.workspace.id })
        .project<{ pdfPathname?: string; zipPathname?: string }>({
          pdfPathname: 1,
          zipPathname: 1,
          _id: 0,
        })
        .toArray(),
    ]);
    return [
      ...attachments.map((attachment) => attachment.pathname),
      ...reports.flatMap((report) =>
        [report.pdfPathname, report.zipPathname].filter(
          (pathname): pathname is string => Boolean(pathname),
        ),
      ),
    ];
  }

  async deleteAccountData(
    context: RequestContext,
  ): Promise<{ deletedWorkspace: boolean }> {
    if (context.member.role === "reviewer") {
      await this.transaction(async (session) => {
        await beginAccountDeletionFence(
          context.identity.authUserId,
          context.workspace.id,
          false,
          session,
        );
        await (await col<Member>("members")).deleteOne(
          {
            id: context.member.id,
            workspaceId: context.workspace.id,
            role: "reviewer",
          },
          { session },
        );
      });
      return { deletedWorkspace: false };
    }

    const workspaceCollections = [
      "agentConfirmations",
      "agentOperations",
      "appointments",
      "attachments",
      "auditEvents",
      "careEntries",
      "caregivers",
      "children",
      "dailyLogs",
      "incidents",
      "members",
      "purgeTombstones",
      "recordRevisions",
      "reportEvidenceSnapshots",
      "reportSnapshots",
      "routineRecordSlots",
      "routineTemplates",
      "specialArrangementDays",
    ] as const;
    await this.transaction(async (session) => {
      await beginAccountDeletionFence(
        context.identity.authUserId,
        context.workspace.id,
        true,
        session,
      );
      for (const collectionName of workspaceCollections) {
        await (
          await col<Record<string, unknown>>(collectionName)
        ).deleteMany({ workspaceId: context.workspace.id }, { session });
      }
      await (await col<Workspace>("workspaces")).deleteOne(
        { id: context.workspace.id },
        { session },
      );
    });
    return { deletedWorkspace: true };
  }

  async addAttachment(context: RequestContext, attachment: Attachment) {
    requireOwner(context.member.role);
    const replay = await this.operationReplay<null>(context);
    if (replay.found) return;
    if (attachment.workspaceId !== context.workspace.id) throw new Error("FORBIDDEN");
    await this.operationMutation(context, async (session) => {
      const result = await (await col<Attachment>("attachments")).updateOne(
        {
          id: attachment.id,
          workspaceId: attachment.workspaceId,
          recordType: attachment.recordType,
          recordId: attachment.recordId,
          pathname: attachment.pathname,
        },
        { $setOnInsert: attachment },
        { upsert: true, session },
      );
      if (result.upsertedCount) {
        await this.insertAudit(context, "created", "attachment", attachment.id, session);
      }
      return null;
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
    await this.transaction(async (session) => {
      await claimAccountMutation(
        context.identity.authUserId,
        context.workspace.id,
        session,
      );
      await this.insertAudit(
        context,
        event.action,
        event.targetType,
        event.targetId,
        session,
        event.metadata,
        event.previousHash,
      );
    });
  }

  private async bootstrap(identity: Identity) {
    const state = createSeedState(false, identity);
    const client = await getMongoClient();
    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        if (
          !(await claimAccountBootstrap(
            identity.authUserId,
            state.workspace.id,
            session,
          ))
        ) {
          throw new Error("ACCOUNT_DELETION_IN_PROGRESS");
        }
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
    if (!session) {
      let result!: DailyLog;
      await this.transaction(async (transactionSession) => {
        await claimAccountMutation(
          context.identity.authUserId,
          context.workspace.id,
          transactionSession,
        );
        result = await this.ensureDailyLog(
          context,
          localDate,
          transactionSession,
        );
      });
      return result;
    }
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

  private async assertDayVersion(
    context: RequestContext,
    dailyLogId: string,
    errorCode: "VERSION_CONFLICT" | "CONFIRMATION_STALE",
    session: ClientSession,
  ): Promise<{ log: StoredDailyLog; version: string }> {
    const currentLog = await (await col<StoredDailyLog>("dailyLogs")).findOne(
      { id: dailyLogId, workspaceId: context.workspace.id },
      { session },
    );
    if (!currentLog) throw new Error("NOT_FOUND");
    const version = await this.calculateDayVersion(
      context,
      toPlainData(currentLog),
      session,
    );
    if (
      context.operation?.expectedDayVersion &&
      context.operation.expectedDayVersion !== version
    ) {
      throw new Error(errorCode);
    }
    return { log: currentLog, version };
  }

  private async claimOpenDailyLog(
    context: RequestContext,
    dailyLogId: string,
    errorCode: "VERSION_CONFLICT" | "CONFIRMATION_STALE",
    session: ClientSession,
  ): Promise<{ log: StoredDailyLog; version: string }> {
    const current = await this.assertDayVersion(
      context,
      dailyLogId,
      errorCode,
      session,
    );
    if (current.log.status !== "open") throw new Error("DAY_FINALIZED");

    const sequenceFilter =
      current.log._writeSequence === undefined
        ? { _writeSequence: { $exists: false } }
        : { _writeSequence: current.log._writeSequence };
    const claimed = await (await col<StoredDailyLog>("dailyLogs")).updateOne(
      {
        id: current.log.id,
        workspaceId: context.workspace.id,
        status: "open",
        ...sequenceFilter,
      },
      { $inc: { _writeSequence: 1 } },
      { session },
    );
    if (!claimed.matchedCount) throw new Error(errorCode);
    return current;
  }

  private async claimFinalizedDailyLog(
    context: RequestContext,
    dailyLogId: string,
    session: ClientSession,
  ): Promise<{ log: StoredDailyLog; version: string }> {
    const current = await this.assertDayVersion(
      context,
      dailyLogId,
      "VERSION_CONFLICT",
      session,
    );
    if (current.log.status !== "finalized") {
      throw new Error("DAY_NOT_FINALIZED");
    }

    const sequenceFilter =
      current.log._writeSequence === undefined
        ? { _writeSequence: { $exists: false } }
        : { _writeSequence: current.log._writeSequence };
    const claimed = await (await col<StoredDailyLog>("dailyLogs")).updateOne(
      {
        id: current.log.id,
        workspaceId: context.workspace.id,
        status: "finalized",
        ...sequenceFilter,
      },
      { $inc: { _writeSequence: 1 } },
      { session },
    );
    if (!claimed.matchedCount) throw new Error("VERSION_CONFLICT");
    return current;
  }

  private async calculateDayVersion(
    context: RequestContext,
    log: DailyLog,
    session: ClientSession,
  ): Promise<string> {
    const [entries, specialArrangement] = await Promise.all([
      (await col<CareEntry>("careEntries"))
        .find(
          { workspaceId: context.workspace.id, dailyLogId: log.id },
          { session },
        )
        .toArray(),
      (await col<SpecialArrangementDay>("specialArrangementDays")).findOne(
        {
          workspaceId: context.workspace.id,
          dailyLogId: log.id,
          status: "active",
        },
        { session },
      ),
    ]);
    const revisionIds = [
      ...entries.map((entry) => entry.currentRevisionId),
      ...(specialArrangement ? [specialArrangement.currentRevisionId] : []),
    ];
    const revisions = revisionIds.length
      ? await (await col<RecordRevision>("recordRevisions"))
          .find(
            {
              workspaceId: context.workspace.id,
              id: { $in: revisionIds },
            },
            { session },
          )
          .toArray()
      : [];
    return dayVersionFor(
      log,
      toPlainData(entries),
      toPlainData(revisions),
      toPlainData(specialArrangement),
    );
  }

  private async consumeAgentConfirmation(
    context: RequestContext,
    targetId: string,
    baseVersion: string,
    session: ClientSession,
  ): Promise<void> {
    const agent = context.agent;
    const operation = context.operation;
    if (!agent?.confirmationTokenHash) return;
    if (!operation) throw new Error("VALIDATION_ERROR");
    const confirmations = await col<AgentConfirmation>("agentConfirmations");
    const confirmation = await confirmations.findOne(
      {
        tokenHash: agent.confirmationTokenHash,
        workspaceId: context.workspace.id,
        memberId: context.member.id,
        oauthClientId: agent.oauthClientId,
        kind: agent.confirmationKind,
        targetId,
      },
      { session },
    );
    if (!confirmation || confirmation.expiresAt.getTime() <= Date.now()) {
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
    const consumed = await confirmations.updateOne(
      {
        id: confirmation.id,
        tokenHash: confirmation.tokenHash,
        consumedByOperationId: { $exists: false },
      },
      {
        $set: {
          consumedAt: new Date(),
          consumedByOperationId: operation.operationId,
        },
      },
      { session },
    );
    if (!consumed.modifiedCount) throw new Error("CONFIRMATION_EXPIRED");
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

  private async operationReplay<T>(
    context: RequestContext,
    session?: ClientSession,
  ): Promise<{ found: true; result: T } | { found: false }> {
    const operation = context.operation;
    if (!operation) return { found: false };
    if (!session) {
      let replay!: { found: true; result: T } | { found: false };
      await this.transaction(async (transactionSession) => {
        await claimAccountMutation(
          context.identity.authUserId,
          context.workspace.id,
          transactionSession,
        );
        replay = await this.operationReplay<T>(context, transactionSession);
      });
      return replay;
    }
    const operations = await col<AgentOperationReceipt>("agentOperations");
    const operationKey = this.operationKey(context);
    const current = await operations.findOne(
      {
        workspaceId: context.workspace.id,
        memberId: context.member.id,
        operationKey,
      },
      { session },
    );
    const legacy =
      !current && operation.source === "mcp"
        ? await operations.findOne(
            {
              workspaceId: context.workspace.id,
              memberId: context.member.id,
              oauthClientId: operation.clientKey,
              operationId: operation.operationId,
              operationKey: { $exists: false },
            },
            { session },
          )
        : null;
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
    return { found: true, result: toPlainData(existing.result) as T };
  }

  private redactConfirmationHandle<T>(result: T): T {
    if (!result || typeof result !== "object" || Array.isArray(result)) return result;
    const redacted = { ...(result as Record<string, unknown>) };
    delete redacted.confirmationHandle;
    return redacted as T;
  }

  private async operationMutation<T>(
    context: RequestContext,
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const operation = context.operation;
    if (!operation) {
      let result!: T;
      await this.transaction(async (session) => {
        await claimAccountMutation(
          context.identity.authUserId,
          context.workspace.id,
          session,
        );
        result = await work(session);
      });
      return result;
    }
    const operationKey = this.operationKey(context);
    const client = await getMongoClient();
    try {
      return await client.withSession(async (session) => {
        let result!: T;
        await session.withTransaction(async () => {
          await claimAccountMutation(
            context.identity.authUserId,
            context.workspace.id,
            session,
          );
          const replay = await this.operationReplay<T>(context, session);
          if (replay.found) {
            result = replay.result;
            return;
          }
          result = await work(session);
          const now = new Date();
          await (await col<AgentOperationReceipt>("agentOperations")).insertOne(
            {
              id: id("agent_operation"),
              workspaceId: context.workspace.id,
              memberId: context.member.id,
              source: operation.source,
              clientKey: operation.clientKey,
              operationName: operation.operationName,
              operationKey,
              operationId: operation.operationId,
              inputHash: operation.inputHash,
              ...(operation.source === "mcp"
                ? {
                    oauthClientId: operation.clientKey,
                    toolName: operation.operationName,
                  }
                : {}),
              result,
              createdAt: now,
              expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            },
            { session },
          );
        });
        return result;
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        const replay = await this.operationReplay<T>(context);
        if (replay.found) return replay.result;
      }
      throw error;
    }
  }

  private async transaction(work: (session: ClientSession) => Promise<void>) {
    const client = await getMongoClient();
    await client.withSession(async (session) => {
      await session.withTransaction(() => work(session));
    });
  }
}
