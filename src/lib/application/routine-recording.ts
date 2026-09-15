import "server-only";

import { z } from "zod";

import { DaybookServiceError } from "@/lib/application/daybook-service";
import {
  localDateInTimezone,
  localDateTimeToUtc,
  weekdayForLocalDate,
} from "@/lib/domain/dates";
import { canonicalJson, sha256 } from "@/lib/domain/integrity";
import type {
  CareEntry,
  CareStatus,
  RoutineTemplateItem,
  TodayTask,
} from "@/lib/domain/types";
import type {
  CareEntryWriteResult,
  ParentingRepository,
  RequestContext,
} from "@/lib/repository/repository";

const careStatuses = [
  "completed",
  "partial",
  "missed",
  "not_applicable",
] as const;

const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use workspace-local HH:mm time.");

export const recordRoutineItemInputSchema = z.object({
  operationId: z.string().uuid(),
  localDate: z.string().date().optional(),
  routineName: z.string().trim().min(1).max(100).optional(),
  routineId: z.string().min(1).optional(),
  status: z.enum(careStatuses).optional(),
  childIds: z.array(z.string().min(1)).optional(),
  caregiverIds: z.array(z.string().min(1)).optional(),
  localTime: localTimeSchema.optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  activityType: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  continuationToken: z.string().min(32).optional(),
});

export type RecordRoutineItemInput = z.infer<
  typeof recordRoutineItemInputSchema
>;

export type RoutineQuestionField =
  | "localDate"
  | "routineId"
  | "status"
  | "childIds"
  | "caregiverIds"
  | "localTime";

export interface RoutineQuestion {
  field: RoutineQuestionField;
  title: string;
  prompt: string;
  type: "date" | "time" | "single_select" | "multi_select";
  choices?: Array<{ value: string; title: string }>;
}

export interface ResolvedRoutineContext {
  timezone: string;
  localDate?: string;
  routine?: {
    id: string;
    name: string;
    scheduledTime: string;
  };
}

export interface RoutineSnapshot {
  routineId: string;
  routineName: string;
  taskKey: RoutineTemplateItem["taskKey"];
  childIds: string[];
  suggestedTime: string;
  templateVersion: number;
  dailyLogId?: string;
  dayVersion?: string;
  fingerprint: string;
}

type WorkflowValues = Omit<RecordRoutineItemInput, "continuationToken">;

export interface RoutineWorkflowState {
  version: 1;
  round: number;
  expiresAt: string;
  values: WorkflowValues;
  questions: RoutineQuestion[];
  snapshot?: RoutineSnapshot;
}

export type RoutineRecordingPlan =
  | {
      result: "needs_input";
      questions: RoutineQuestion[];
      resolvedContext: ResolvedRoutineContext;
      values: WorkflowValues;
      snapshot?: RoutineSnapshot;
    }
  | {
      result: "already_recorded";
      record: CareEntry;
      recordVersion: string;
      values: WorkflowValues;
      snapshot: RoutineSnapshot;
    }
  | {
      result: "ready";
      mutation: {
        localDate: string;
        templateItemId: string;
        taskKey: RoutineTemplateItem["taskKey"];
        taskLabel: string;
        childIds: string[];
        caregiverIds: string[];
        status: CareStatus;
        occurredAt: string;
        durationMinutes?: number;
        activityType?: string;
        notes?: string;
      };
      effectiveInput: Record<string, unknown>;
      values: WorkflowValues;
      snapshot: RoutineSnapshot;
    };

interface RoutineDayResolution {
  tasks: TodayTask[];
  templateVersion: number;
  dailyLogId?: string;
  dayVersion?: string;
  status: "open" | "finalized";
  specialArrangement: boolean;
}

function validationError(
  field: RoutineQuestionField | "routineName",
  message: string,
): never {
  throw new DaybookServiceError("VALIDATION_ERROR", { [field]: [message] });
}

function unique(values: string[], field: "childIds" | "caregiverIds") {
  if (new Set(values).size !== values.length) {
    validationError(field, "Each selection may appear only once.");
  }
  return values;
}

export function normalizeRoutineName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function question(
  field: RoutineQuestionField,
  title: string,
  prompt: string,
  type: RoutineQuestion["type"],
  choices?: RoutineQuestion["choices"],
): RoutineQuestion {
  return { field, title, prompt, type, ...(choices ? { choices } : {}) };
}

function statusQuestion(): RoutineQuestion {
  return question(
    "status",
    "Outcome",
    "What was the outcome for this routine item?",
    "single_select",
    [
      { value: "completed", title: "Completed" },
      { value: "partial", title: "Partially completed" },
      { value: "missed", title: "Missed" },
      { value: "not_applicable", title: "Not applicable" },
    ],
  );
}

function taskSnapshot(
  task: TodayTask,
  day: RoutineDayResolution,
): RoutineSnapshot {
  const stableTask = {
    routineId: task.templateItemId!,
    routineName: task.label,
    taskKey: task.taskKey,
    childIds: [...task.childIds].sort(),
    suggestedTime: task.suggestedTime,
    templateVersion: day.templateVersion,
    dailyLogId: day.dailyLogId,
  };
  return {
    ...stableTask,
    dayVersion: day.dayVersion,
    fingerprint: sha256(canonicalJson(stableTask)),
  };
}

function withoutDisposition(entry: CareEntryWriteResult) {
  const record: Partial<CareEntryWriteResult> = { ...entry };
  delete record.writeDisposition;
  delete record.recordVersion;
  return record as CareEntry;
}

async function existingResult(
  repository: ParentingRepository,
  context: RequestContext,
  task: TodayTask,
): Promise<CareEntryWriteResult | null> {
  if (!task.entry) return null;
  const bundle = await repository.getRecordBundle(
    context,
    "care_entry",
    task.entry.id,
  );
  const recordVersion = bundle?.revisions.at(-1)?.hash;
  if (!recordVersion) throw new Error("REVISION_NOT_FOUND");
  return { ...task.entry, recordVersion, writeDisposition: "existing" };
}

async function resolveDay(
  repository: ParentingRepository,
  context: RequestContext,
  localDate: string,
): Promise<RoutineDayResolution> {
  try {
    const dashboard = await repository.getDashboard(context, localDate, false);
    return {
      tasks: dashboard.tasks,
      templateVersion: dashboard.dailyLog.templateVersion,
      dailyLogId: dashboard.dailyLog.id,
      dayVersion: await repository.getDayVersion(context, localDate),
      status: dashboard.dailyLog.status,
      specialArrangement: Boolean(dashboard.specialArrangement),
    };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "NOT_FOUND") throw error;
  }

  const settings = await repository.getSettings(context);
  const weekday = weekdayForLocalDate(localDate);
  return {
    tasks: settings.template.items
      .filter((item) => item.active && item.weekdays.includes(weekday))
      .map((item) => ({
        ...item,
        source: "routine" as const,
        templateItemId: item.id,
        plannedCaregiverIds: [],
      })),
    templateVersion: settings.template.version,
    status: "open",
    specialArrangement: false,
  };
}

function mergeValues(
  input: RecordRoutineItemInput,
  prior?: RoutineWorkflowState,
): WorkflowValues {
  const supplied = { ...input };
  delete supplied.continuationToken;
  if (!prior) return supplied;
  if (prior.values.operationId !== supplied.operationId) {
    throw new Error("WORKFLOW_EXPIRED");
  }
  const merged = { ...supplied, ...prior.values };
  for (const pending of prior.questions) {
    const answer = supplied[pending.field];
    if (answer !== undefined) {
      Object.assign(merged, { [pending.field]: answer });
    }
  }
  return merged;
}

export async function planRoutineRecording(
  repository: ParentingRepository,
  context: RequestContext,
  input: RecordRoutineItemInput,
  prior?: RoutineWorkflowState,
): Promise<RoutineRecordingPlan> {
  if (context.member.role !== "owner") throw new Error("FORBIDDEN");
  const values = mergeValues(input, prior);
  const settings = await repository.getSettings(context);
  const resolvedContext: ResolvedRoutineContext = {
    timezone: context.workspace.timezone,
    localDate: values.localDate,
  };
  const initialQuestions: RoutineQuestion[] = [];
  if (!values.localDate) {
    initialQuestions.push(
      question(
        "localDate",
        "Routine date",
        "Which local date should this routine item be recorded for?",
        "date",
      ),
    );
  }
  if (!values.status) initialQuestions.push(statusQuestion());
  if (!values.localDate) {
    return {
      result: "needs_input",
      questions: initialQuestions,
      resolvedContext,
      values,
      snapshot: prior?.snapshot,
    };
  }

  const currentLocalDate = localDateInTimezone(
    new Date(),
    context.workspace.timezone,
  );
  if (values.localDate > currentLocalDate) {
    validationError("localDate", "Routine items cannot be recorded for a future date.");
  }

  const day = await resolveDay(repository, context, values.localDate);
  if (day.specialArrangement) throw new Error("ROUTINE_UNAVAILABLE");
  const candidates = day.tasks.filter(
    (task) => task.source === "routine" && task.templateItemId,
  );
  if (candidates.length === 0) throw new Error("ROUTINE_UNAVAILABLE");

  let task: TodayTask | undefined;
  if (values.routineId) {
    task = candidates.find((candidate) => candidate.templateItemId === values.routineId);
    if (!task) validationError("routineId", "Choose a routine scheduled for this date.");
  } else if (values.routineName) {
    const normalizedName = normalizeRoutineName(values.routineName);
    const exact = candidates.filter(
      (candidate) => normalizeRoutineName(candidate.label) === normalizedName,
    );
    if (exact.length === 1) task = exact[0];
  }

  if (!task) {
    const named = values.routineName ? ` matching “${values.routineName}”` : "";
    return {
      result: "needs_input",
      questions: [
        ...initialQuestions,
        question(
          "routineId",
          "Routine",
          `Choose the routine item${named} scheduled for ${values.localDate}.`,
          "single_select",
          candidates
            .sort(
              (left, right) =>
                left.suggestedTime.localeCompare(right.suggestedTime) ||
                left.sortOrder - right.sortOrder,
            )
            .map((candidate) => ({
              value: candidate.templateItemId!,
              title: `${candidate.label} (${candidate.suggestedTime})`,
            })),
        ),
      ],
      resolvedContext,
      values,
      snapshot: prior?.snapshot,
    };
  }

  const snapshot = taskSnapshot(task, day);
  resolvedContext.routine = {
    id: snapshot.routineId,
    name: snapshot.routineName,
    scheduledTime: snapshot.suggestedTime,
  };
  const existing = await existingResult(repository, context, task);
  if (existing) {
    return {
      result: "already_recorded",
      record: withoutDisposition(existing),
      recordVersion: existing.recordVersion,
      values: { ...values, routineId: snapshot.routineId },
      snapshot,
    };
  }
  if (
    prior?.snapshot &&
    (prior.snapshot.routineId !== snapshot.routineId ||
      prior.snapshot.fingerprint !== snapshot.fingerprint ||
      prior.snapshot.dailyLogId !== snapshot.dailyLogId ||
      prior.snapshot.dayVersion !== snapshot.dayVersion)
  ) {
    throw new Error("VERSION_CONFLICT");
  }
  if (day.status === "finalized") throw new Error("DAY_FINALIZED");

  const questions = [...initialQuestions];
  const activeChildren = new Map(
    settings.children
      .filter((child) => child.active)
      .map((child) => [child.id, child] as const),
  );
  const allowedChildIds = task.childIds.filter((childId) => activeChildren.has(childId));
  if (allowedChildIds.length === 0) {
    validationError("childIds", "This routine has no active assigned child.");
  }
  let childIds = values.childIds;
  if (allowedChildIds.length === 1) {
    childIds = [allowedChildIds[0]];
  } else if (!childIds?.length) {
    questions.push(
      question(
        "childIds",
        "Children",
        "Which children were included in this routine item?",
        "multi_select",
        allowedChildIds.map((childId) => ({
          value: childId,
          title: activeChildren.get(childId)!.displayName,
        })),
      ),
    );
  }
  if (childIds) {
    unique(childIds, "childIds");
    if (
      childIds.length === 0 ||
      childIds.some((childId) => !allowedChildIds.includes(childId))
    ) {
      validationError("childIds", "Choose a nonempty subset assigned to this routine.");
    }
  }

  let caregiverIds = values.caregiverIds;
  let localTime = values.localTime;
  const activeCaregivers = settings.caregivers.filter((caregiver) => caregiver.active);
  if (values.status === "completed" || values.status === "partial") {
    if (activeCaregivers.length === 0) {
      validationError("caregiverIds", "No active caregiver is available.");
    }
    if (!caregiverIds?.length) {
      questions.push(
        question(
          "caregiverIds",
          "Caregivers",
          "Who provided the care?",
          "multi_select",
          activeCaregivers.map((caregiver) => ({
            value: caregiver.id,
            title: caregiver.displayName,
          })),
        ),
      );
    }
    if (!localTime) {
      questions.push(
        question(
          "localTime",
          "Actual local time",
          "What workspace-local time did the routine item actually occur?",
          "time",
        ),
      );
    }
  } else if (values.status === "missed" || values.status === "not_applicable") {
    if (caregiverIds?.length) {
      validationError(
        "caregiverIds",
        "Missed and not-applicable items cannot assign a caregiver.",
      );
    }
    if (values.durationMinutes !== undefined || values.activityType !== undefined) {
      throw new DaybookServiceError("VALIDATION_ERROR", {
        status: ["Duration and activity apply only when care occurred."],
      });
    }
    caregiverIds = [];
    localTime ??= task.suggestedTime;
  }

  if (caregiverIds) {
    unique(caregiverIds, "caregiverIds");
    const activeCaregiverIds = new Set(activeCaregivers.map((caregiver) => caregiver.id));
    if (caregiverIds.some((caregiverId) => !activeCaregiverIds.has(caregiverId))) {
      validationError("caregiverIds", "Choose only active caregivers.");
    }
  }

  if (questions.length > 0) {
    return {
      result: "needs_input",
      questions,
      resolvedContext,
      values: {
        ...values,
        routineId: snapshot.routineId,
        childIds,
        caregiverIds,
        localTime,
      },
      snapshot,
    };
  }

  if (!values.status || !childIds || !caregiverIds || !localTime) {
    throw new Error("VALIDATION_ERROR");
  }
  const occurredAt = localDateTimeToUtc(
    `${values.localDate}T${localTime}`,
    context.workspace.timezone,
  );
  const mutation = {
    localDate: values.localDate,
    templateItemId: snapshot.routineId,
    taskKey: snapshot.taskKey,
    taskLabel: snapshot.routineName,
    childIds,
    caregiverIds,
    status: values.status,
    occurredAt,
    durationMinutes: values.durationMinutes,
    activityType: values.activityType,
    notes: values.notes,
  };
  for (const optional of ["durationMinutes", "activityType", "notes"] as const) {
    if (mutation[optional] === undefined) delete mutation[optional];
  }
  const normalizedValues = {
    ...values,
    routineId: snapshot.routineId,
    childIds,
    caregiverIds,
    localTime,
  };
  return {
    result: "ready",
    mutation,
    effectiveInput: {
      operationId: values.operationId,
      localDate: values.localDate,
      routineId: snapshot.routineId,
      routineFingerprint: snapshot.fingerprint,
      childIds,
      caregiverIds,
      status: values.status,
      localTime,
      durationMinutes: values.durationMinutes,
      activityType: values.activityType,
      notes: values.notes,
      dayVersion: snapshot.dayVersion,
    },
    values: normalizedValues,
    snapshot,
  };
}

export function workflowStateFor(
  plan: Extract<RoutineRecordingPlan, { result: "needs_input" }>,
  round: number,
  expiresAt: string,
): RoutineWorkflowState {
  return {
    version: 1,
    round,
    expiresAt,
    values: plan.values,
    questions: plan.questions,
    snapshot: plan.snapshot,
  };
}

export function routineQuestionSchema(questions: RoutineQuestion[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const item of questions) {
    const values = item.choices?.map((choice) => choice.value);
    if (item.field === "localDate") shape[item.field] = z.string().date();
    else if (item.field === "localTime") shape[item.field] = localTimeSchema;
    else if (item.type === "multi_select") {
      shape[item.field] = z
        .array(z.string())
        .min(1)
        .refine((selected) => selected.every((value) => values?.includes(value)));
    } else {
      shape[item.field] = z
        .string()
        .refine((value) => values?.includes(value) ?? false);
    }
  }
  return z.object(shape);
}

export function routineQuestionJsonSchema(questions: RoutineQuestion[]) {
  const properties: Record<string, Record<string, unknown>> = {};
  for (const item of questions) {
    if (item.type === "date" || item.type === "time") {
      properties[item.field] = {
        type: "string",
        title: item.title,
        description: item.prompt,
        ...(item.type === "date" ? { format: "date" } : {}),
      };
    } else if (item.type === "single_select") {
      properties[item.field] = {
        type: "string",
        title: item.title,
        description: item.prompt,
        oneOf: item.choices!.map((choice) => ({
          const: choice.value,
          title: choice.title,
        })),
      };
    } else {
      properties[item.field] = {
        type: "array",
        title: item.title,
        description: item.prompt,
        minItems: 1,
        items: {
          anyOf: item.choices!.map((choice) => ({
            const: choice.value,
            title: choice.title,
          })),
        },
      };
    }
  }
  return {
    type: "object" as const,
    title: "Complete routine record",
    properties,
    required: questions.map((item) => item.field),
  };
}

export function createdRoutineResult(entry: CareEntryWriteResult) {
  const record = withoutDisposition(entry);
  return {
    result: entry.writeDisposition === "created" ? ("created" as const) : ("already_recorded" as const),
    record,
    recordVersion: entry.recordVersion,
  };
}
