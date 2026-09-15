import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import { z } from "zod";

import type { AgentConfirmationKind } from "@/lib/agents/types";
import {
  isValidLocalDate,
  localDateInTimezone,
} from "@/lib/domain/dates";
import { canonicalJson, id, sha256 } from "@/lib/domain/integrity";
import {
  careEntryCorrectionSchema,
  careEntryUpdateSchema,
  dailyLogNotesSchema,
} from "@/lib/domain/schemas";
import type {
  CareEntry,
  CareStatus,
  DashboardData,
  RecordRevision,
} from "@/lib/domain/types";
import type {
  ParentingRepository,
  RequestContext,
  VersionedCareEntry,
} from "@/lib/repository/repository";

const careDetailsSchema = z.object({
  childIds: z.array(z.string().min(1)).min(1),
  caregiverIds: z.array(z.string().min(1)),
  status: z.enum(["completed", "partial", "missed", "not_applicable"]),
  occurredAt: z.string().datetime({ local: true }).or(z.string().datetime()),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  activityType: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const daybookCreateCareEntrySchema = careDetailsSchema.extend({
  localDate: z.string().date(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("routine"), templateItemId: z.string().min(1) }),
    z.object({
      kind: z.literal("special_arrangement"),
      arrangementTaskId: z.string().min(1),
    }),
    z.object({
      kind: z.literal("custom"),
      label: z.string().trim().min(2).max(100),
    }),
  ]),
});

export type DaybookCreateCareEntryInput = z.infer<
  typeof daybookCreateCareEntrySchema
>;

export interface CareEntryView {
  record: CareEntry;
  recordVersion: string;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    reason: string;
    authorId: string;
    recordedAt: string;
    hash: string;
    payload: Record<string, unknown>;
  }>;
}

export interface DayView {
  localDate: string;
  status: "open" | "finalized";
  notes?: string;
  finalizedAt?: string;
  dayVersion: string;
  tasks: Array<
    Omit<DashboardData["tasks"][number], "entry"> & {
      recorded: boolean;
      entryId?: string;
    }
  >;
  specialArrangement?: Pick<
    NonNullable<DashboardData["specialArrangement"]>,
    "id" | "localDate" | "title" | "note" | "status" | "assignments" | "tasks"
  >;
  careEntries: Array<CareEntry & { recordVersion: string }>;
  completion: DashboardData["completion"];
}

export class DaybookServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(code);
  }
}

const ephemeralConfirmationKey = randomBytes(32);

function validationError(error: z.ZodError): never {
  throw new DaybookServiceError("VALIDATION_ERROR", error.flatten().fieldErrors);
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) validationError(result.error);
  return result.data;
}

function requireOwner(context: RequestContext): void {
  if (context.member.role !== "owner") throw new Error("FORBIDDEN");
}

function assertUnique(values: string[]): void {
  if (new Set(values).size !== values.length) {
    throw new DaybookServiceError("VALIDATION_ERROR");
  }
}

function careEntryFields(entry: CareEntry) {
  return {
    childIds: entry.childIds,
    caregiverIds: entry.caregiverIds,
    status: entry.status,
    occurredAt: entry.occurredAt,
    durationMinutes: entry.durationMinutes,
    activityType: entry.activityType,
    notes: entry.notes,
  };
}

function changedFields(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
) {
  return Object.keys({ ...current, ...proposed })
    .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(proposed[key]))
    .map((field) => ({ field, from: current[field], to: proposed[field] }));
}

export class DaybookService {
  constructor(
    private readonly repository: ParentingRepository,
    private readonly context: RequestContext,
  ) {}

  async getContext() {
    const settings = await this.repository.getSettings(this.context);
    return {
      role: this.context.member.role,
      timezone: this.context.workspace.timezone,
      currentLocalDate: localDateInTimezone(
        new Date(),
        this.context.workspace.timezone,
      ),
      children: settings.children
        .filter((child) => child.active)
        .map(({ id: childId, displayName }) => ({ childId, displayName })),
      caregivers: settings.caregivers
        .filter((caregiver) => caregiver.active)
        .map(({ id: caregiverId, displayName, relationship }) => ({
          caregiverId,
          displayName,
          relationship,
        })),
    };
  }

  async getDay(localDate: string): Promise<DayView> {
    this.assertPermittedDate(localDate);
    const dashboard = await this.repository.getDashboard(
      this.context,
      localDate,
      !this.context.agent,
    );
    const entries = await Promise.all(
      dashboard.recentEntries.map(async (entry) => {
        const bundle = await this.repository.getRecordBundle(
          this.context,
          "care_entry",
          entry.id,
        );
        const recordVersion = bundle?.revisions.at(-1)?.hash;
        if (!recordVersion) throw new Error("REVISION_NOT_FOUND");
        return { ...entry, recordVersion };
      }),
    );
    return {
      localDate,
      status: dashboard.dailyLog.status,
      notes: dashboard.dailyLog.notes,
      finalizedAt: dashboard.dailyLog.finalizedAt,
      dayVersion: await this.repository.getDayVersion(this.context, localDate),
      tasks: dashboard.tasks.map(({ entry, ...task }) => ({
        ...task,
        recorded: Boolean(entry),
        entryId: entry?.id,
      })),
      specialArrangement: dashboard.specialArrangement
        ? {
            id: dashboard.specialArrangement.id,
            localDate: dashboard.specialArrangement.localDate,
            title: dashboard.specialArrangement.title,
            note: dashboard.specialArrangement.note,
            status: dashboard.specialArrangement.status,
            assignments: dashboard.specialArrangement.assignments,
            tasks: dashboard.specialArrangement.tasks,
          }
        : undefined,
      careEntries: entries,
      completion: dashboard.completion,
    };
  }

  async getCareEntry(recordId: string): Promise<CareEntryView> {
    const bundle = await this.repository.getRecordBundle(
      this.context,
      "care_entry",
      recordId,
    );
    if (!bundle || !("dailyLogId" in bundle.record)) throw new Error("NOT_FOUND");
    const latest = bundle.revisions.at(-1);
    if (!latest) throw new Error("REVISION_NOT_FOUND");
    return {
      record: bundle.record,
      recordVersion: latest.hash,
      revisions: bundle.revisions.map((revision) => ({
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        reason: revision.reason,
        authorId: revision.authorId,
        recordedAt: revision.recordedAt,
        hash: revision.hash,
        payload: revision.payload,
      })),
    };
  }

  async createCareEntry(input: unknown) {
    requireOwner(this.context);
    const parsed = parseOrThrow(daybookCreateCareEntrySchema, input);
    this.assertPermittedDate(parsed.localDate);
    const dashboard = await this.repository.getDashboard(
      this.context,
      parsed.localDate,
    );
    if (
      this.context.agent?.expectedDayVersion &&
      (await this.repository.getDayVersion(this.context, parsed.localDate)) !==
        this.context.agent.expectedDayVersion
    ) {
      throw new Error("VERSION_CONFLICT");
    }
    await this.assertActiveReferences(parsed.childIds, parsed.caregiverIds);
    assertUnique(parsed.childIds);
    assertUnique(parsed.caregiverIds);

    const source = parsed.source;
    let task: DashboardData["tasks"][number] | undefined;
    if (source.kind === "routine") {
      task = dashboard.tasks.find(
        (item) =>
          item.source === "routine" &&
          item.templateItemId === source.templateItemId,
      );
    } else if (source.kind === "special_arrangement") {
      task = dashboard.tasks.find(
        (item) =>
          item.source === "special_arrangement" &&
          item.arrangementTaskId === source.arrangementTaskId,
      );
    }
    if (parsed.source.kind !== "custom" && !task) {
      throw new Error(
        parsed.source.kind === "routine"
          ? "INVALID_ROUTINE_ITEM"
          : "INVALID_ARRANGEMENT_TASK",
      );
    }
    this.assertOccurrenceDate(parsed.occurredAt, parsed.localDate);

    const entry = await this.repository.createCareEntry(this.context, {
        localDate: parsed.localDate,
        templateItemId:
          source.kind === "routine" ? source.templateItemId : undefined,
        arrangementTaskId:
          source.kind === "special_arrangement"
            ? source.arrangementTaskId
            : undefined,
        taskKey: source.kind === "custom" ? "custom" : task!.taskKey,
        taskLabel: source.kind === "custom" ? source.label : task!.label,
        childIds: parsed.childIds,
        caregiverIds: parsed.caregiverIds,
        status: parsed.status,
        occurredAt: parsed.occurredAt,
        durationMinutes: parsed.durationMinutes,
        activityType: parsed.activityType,
        notes: parsed.notes,
    });
    delete (entry as Partial<typeof entry>).writeDisposition;
    return entry;
  }

  async updateCareEntry(input: unknown) {
    requireOwner(this.context);
    const replay = await this.repository.getAgentOperationResult<VersionedCareEntry>(
      this.context,
    );
    if (replay.found) return replay.result;
    const parsed = parseOrThrow(careEntryUpdateSchema, input);
    const current = await this.getCareEntry(parsed.recordId);
    await this.assertActiveReferences(parsed.childIds, parsed.caregiverIds);
    assertUnique(parsed.childIds);
    assertUnique(parsed.caregiverIds);
    const originalDate = localDateInTimezone(
      new Date(current.record.occurredAt),
      this.context.workspace.timezone,
    );
    const day = await this.getDay(originalDate);
    if (day.status !== "open") throw new Error("DAY_FINALIZED");
    this.assertOccurrenceDate(parsed.occurredAt, originalDate);
    return this.repository.updateCareEntry(this.context, parsed);
  }

  async correctCareEntry(input: unknown) {
    requireOwner(this.context);
    const replay = await this.repository.getAgentOperationResult<RecordRevision>(
      this.context,
    );
    if (replay.found) return replay.result;
    const parsed = parseOrThrow(careEntryCorrectionSchema, input);
    const current = await this.getCareEntry(parsed.recordId);
    await this.assertActiveReferences(parsed.childIds, parsed.caregiverIds);
    assertUnique(parsed.childIds);
    assertUnique(parsed.caregiverIds);
    const originalDate = localDateInTimezone(
      new Date(current.record.occurredAt),
      this.context.workspace.timezone,
    );
    const day = await this.getDay(originalDate);
    if (day.status !== "finalized") throw new Error("DAY_NOT_FINALIZED");
    this.assertOccurrenceDate(parsed.occurredAt, originalDate);
    return this.repository.correctCareEntry(this.context, parsed);
  }

  async updateDayNotes(input: unknown) {
    requireOwner(this.context);
    const replay = await this.repository.getAgentOperationResult<
      Awaited<ReturnType<ParentingRepository["updateDailyLogNotes"]>>
    >(this.context);
    if (replay.found) return replay.result;
    const parsed = parseOrThrow(dailyLogNotesSchema, input);
    this.assertPermittedDate(parsed.localDate);
    return this.repository.updateDailyLogNotes(this.context, parsed);
  }

  async previewCareEntryCorrection(input: unknown) {
    requireOwner(this.context);
    const replay = await this.repository.getAgentOperationResult<{
      current: ReturnType<typeof careEntryFields>;
      proposed: ReturnType<typeof careEntryFields>;
      diff: Array<{ field: string; from: unknown; to: unknown }>;
      recordVersion: string;
      confirmationHandle: string;
      expiresAt: string;
    }>(this.context);
    if (replay.found) {
      return {
        ...replay.result,
        confirmationHandle: this.confirmationHandle(),
      };
    }
    const parsed = parseOrThrow(
      careEntryCorrectionSchema.safeExtend({ recordVersion: z.string().min(1) }),
      input,
    );
    const current = await this.getCareEntry(parsed.recordId);
    if (current.recordVersion !== parsed.recordVersion) {
      throw new Error("VERSION_CONFLICT");
    }
    await this.assertActiveReferences(parsed.childIds, parsed.caregiverIds);
    assertUnique(parsed.childIds);
    assertUnique(parsed.caregiverIds);
    const originalDate = localDateInTimezone(
      new Date(current.record.occurredAt),
      this.context.workspace.timezone,
    );
    const day = await this.getDay(originalDate);
    if (day.status !== "finalized") throw new Error("DAY_NOT_FINALIZED");
    this.assertOccurrenceDate(parsed.occurredAt, originalDate);
    const correction = parseOrThrow(careEntryCorrectionSchema, parsed);
    const proposed = careEntryFields({
      ...current.record,
      ...correction,
      occurredAt: new Date(correction.occurredAt).toISOString(),
    });
    return this.createConfirmation(
      "care_entry_correction",
      current.record.id,
      current.recordVersion,
      { correction },
      {
        current: careEntryFields(current.record),
        proposed,
        diff: changedFields(careEntryFields(current.record), proposed),
        recordVersion: current.recordVersion,
      },
    );
  }

  async confirmCareEntryCorrection(handle: string) {
    const replay = await this.repository.getAgentOperationResult<RecordRevision>(
      this.context,
    );
    if (replay.found) {
      return { revisionId: replay.result.id, recordVersion: replay.result.hash };
    }
    const confirmation = await this.requireConfirmation(
      handle,
      "care_entry_correction",
    );
    const correction = confirmation.payload.correction;
    const parsed = parseOrThrow(careEntryCorrectionSchema, correction);
    const revision = await this.repository.correctCareEntry(
      this.confirmationContext(handle, confirmation.kind, confirmation.baseVersion),
      parsed,
    );
    return { revisionId: revision.id, recordVersion: revision.hash };
  }

  async previewDayFinalization(
    localDate: string,
    expectedDayVersion = this.context.agent?.expectedDayVersion,
  ) {
    requireOwner(this.context);
    const replay = await this.repository.getAgentOperationResult<{
      localDate: string;
      status: "open";
      notes?: string;
      completion: DashboardData["completion"];
      careEntries: Array<{
        id: string;
        taskLabel: string;
        status: CareStatus;
        occurredAt: string;
      }>;
      dayVersion: string;
      confirmationHandle: string;
      expiresAt: string;
    }>(this.context);
    if (replay.found) {
      return {
        ...replay.result,
        confirmationHandle: this.confirmationHandle(),
      };
    }
    const day = await this.getDay(localDate);
    if (expectedDayVersion && day.dayVersion !== expectedDayVersion) {
      throw new Error("VERSION_CONFLICT");
    }
    if (day.status !== "open") throw new Error("DAY_FINALIZED");
    const dashboard = await this.repository.getDashboard(this.context, localDate);
    return this.createConfirmation(
      "day_finalization",
      dashboard.dailyLog.id,
      day.dayVersion,
      { localDate },
      {
        localDate,
        status: day.status,
        notes: day.notes,
        completion: day.completion,
        careEntries: day.careEntries.map((entry) => ({
          id: entry.id,
          taskLabel: entry.taskLabel,
          status: entry.status,
          occurredAt: entry.occurredAt,
        })),
        dayVersion: day.dayVersion,
      },
    );
  }

  async confirmDayFinalization(handle: string) {
    const replay = await this.repository.getAgentOperationResult<
      Awaited<ReturnType<ParentingRepository["finalizeDailyLog"]>>
    >(this.context);
    if (replay.found) {
      return {
        localDate: replay.result.localDate,
        status: replay.result.status,
        finalizedAt: replay.result.finalizedAt,
        dayVersion: replay.result.dayVersion,
      };
    }
    const confirmation = await this.requireConfirmation(handle, "day_finalization");
    const localDate = z.string().date().parse(confirmation.payload.localDate);
    const log = await this.repository.finalizeDailyLog(
      this.confirmationContext(handle, confirmation.kind, confirmation.baseVersion),
      localDate,
    );
    return {
      localDate,
      status: log.status,
      finalizedAt: log.finalizedAt,
      dayVersion: log.dayVersion,
    };
  }

  async finalizeDay(localDate: string) {
    requireOwner(this.context);
    const replay = await this.repository.getAgentOperationResult<
      Awaited<ReturnType<ParentingRepository["finalizeDailyLog"]>>
    >(this.context);
    if (replay.found) return replay.result;
    this.assertPermittedDate(localDate);
    return this.repository.finalizeDailyLog(this.context, localDate);
  }

  private async createConfirmation<T extends Record<string, unknown>>(
    kind: AgentConfirmationKind,
    targetId: string,
    baseVersion: string,
    payload: Record<string, unknown>,
    preview: T,
  ) {
    if (!this.context.agent) throw new Error("FORBIDDEN");
    const handle = this.confirmationHandle();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
    const result = { ...preview, confirmationHandle: handle, expiresAt: expiresAt.toISOString() };
    return this.repository.createAgentConfirmation(
      this.context,
      {
        id: id("agent_confirmation"),
        tokenHash: sha256(handle),
        workspaceId: this.context.workspace.id,
        memberId: this.context.member.id,
        oauthClientId: this.context.agent.oauthClientId,
        kind,
        targetId,
        baseVersion,
        payload,
        createdAt,
        expiresAt,
      },
      result,
    );
  }

  private confirmationHandle(): string {
    const agent = this.context.agent;
    if (!agent?.operationId || !agent.toolName || !agent.inputHash) {
      throw new Error("VALIDATION_ERROR");
    }
    const key = process.env.CLERK_SECRET_KEY || ephemeralConfirmationKey;
    return createHmac("sha256", key)
      .update(
        canonicalJson({
          purpose: "family-daybook-confirmation-v1",
          workspaceId: this.context.workspace.id,
          memberId: this.context.member.id,
          oauthClientId: agent.oauthClientId,
          toolName: agent.toolName,
          operationId: agent.operationId,
          inputHash: agent.inputHash,
        }),
      )
      .digest("base64url");
  }

  private async requireConfirmation(handle: string, kind: AgentConfirmationKind) {
    requireOwner(this.context);
    if (!this.context.agent) throw new Error("FORBIDDEN");
    const confirmation = await this.repository.getAgentConfirmation(
      this.context,
      sha256(handle),
    );
    if (!confirmation || confirmation.expiresAt.getTime() <= Date.now()) {
      throw new Error("CONFIRMATION_EXPIRED");
    }
    if (confirmation.kind !== kind) throw new Error("CONFIRMATION_EXPIRED");
    if (
      confirmation.consumedByOperationId &&
      confirmation.consumedByOperationId !== this.context.agent.operationId
    ) {
      throw new Error("CONFIRMATION_EXPIRED");
    }
    return confirmation;
  }

  private confirmationContext(
    handle: string,
    kind: AgentConfirmationKind,
    baseVersion: string,
  ): RequestContext {
    if (!this.context.agent) throw new Error("FORBIDDEN");
    return {
      ...this.context,
      agent: {
        ...this.context.agent,
        confirmationTokenHash: sha256(handle),
        confirmationKind: kind,
        ...(kind === "care_entry_correction"
          ? { expectedRecordVersion: baseVersion }
          : { expectedDayVersion: baseVersion }),
      },
    };
  }

  private assertPermittedDate(localDate: string): void {
    const today = localDateInTimezone(new Date(), this.context.workspace.timezone);
    if (!isValidLocalDate(localDate) || localDate > today) {
      throw new DaybookServiceError("VALIDATION_ERROR", {
        localDate: ["Choose today or an earlier valid date."],
      });
    }
  }

  private assertOccurrenceDate(occurredAt: string, localDate: string): void {
    const occurredDate = localDateInTimezone(
      new Date(occurredAt),
      this.context.workspace.timezone,
    );
    if (occurredDate !== localDate) {
      throw new DaybookServiceError("VALIDATION_ERROR", {
        occurredAt: ["The occurrence time must fall on the selected log date."],
      });
    }
  }

  private async assertActiveReferences(
    childIds: string[],
    caregiverIds: string[],
  ): Promise<void> {
    const settings = await this.repository.getSettings(this.context);
    const activeChildren = new Set(
      settings.children.filter((child) => child.active).map((child) => child.id),
    );
    const activeCaregivers = new Set(
      settings.caregivers
        .filter((caregiver) => caregiver.active)
        .map((caregiver) => caregiver.id),
    );
    if (childIds.some((childId) => !activeChildren.has(childId))) {
      throw new DaybookServiceError("VALIDATION_ERROR", {
        childIds: ["One or more children are not active in this workspace."],
      });
    }
    if (caregiverIds.some((caregiverId) => !activeCaregivers.has(caregiverId))) {
      throw new DaybookServiceError("VALIDATION_ERROR", {
        caregiverIds: ["One or more caregivers are not active in this workspace."],
      });
    }
  }
}

export function createDaybookService(
  repository: ParentingRepository,
  context: RequestContext,
) {
  return new DaybookService(repository, context);
}
