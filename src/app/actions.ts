"use server";

import { revalidatePath } from "next/cache";

import { clerkConfigured } from "@/lib/auth/identity";
import {
  createDaybookService,
  DaybookServiceError,
} from "@/lib/application/daybook-service";
import { careStatusRecordsProvidedCare } from "@/lib/domain/care-entry-rules";
import { localDateInTimezone } from "@/lib/domain/dates";
import type {
  AttachmentUploadClaim,
  PreparedAttachmentUpload,
} from "@/lib/domain/attachments";
import {
  attachmentUploadClaimSchema,
  attachmentUploadRequestSchema,
  appointmentSchema,
  careEntryCorrectionSchema,
  careEntrySchema,
  careEntryTextUpdateSchema,
  careEntryUpdateSchema,
  correctionSchema,
  dailyLogNotesSchema,
  incidentSchema,
  inviteSchema,
  purgeSchema,
  reportSchema,
  specialArrangementCorrectionSchema,
  specialArrangementCreateSchema,
  specialArrangementUpdateSchema,
  workspaceSettingsSchema,
} from "@/lib/domain/schemas";
import type { ActionResult, Caregiver, Child, RoutineTemplate } from "@/lib/domain/types";
import { getRepository, getRequestContext } from "@/lib/repository";
import { generateEvidencePackage } from "@/lib/reporting/generate-package";
import {
  completeAttachmentUpload,
  prepareAttachmentUpload,
} from "@/lib/storage/attachment-uploads";
import {
  blobConfigured,
  deletePrivateFiles,
  putPrivateFile,
} from "@/lib/storage/private-files";
import { generateReportWorkflow } from "@/workflows/generate-report";

function fail(error: unknown): ActionResult<never> {
  if (error instanceof DaybookServiceError) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: error.fieldErrors,
    };
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  const safe: Record<string, string> = {
    FORBIDDEN: "You do not have permission to perform this action.",
    UNAUTHENTICATED: "Please sign in to continue.",
    SUBSCRIPTION_REQUIRED:
      "A paid Family Daybook plan is required to use this workspace.",
    BILLING_ACCESS_UNAVAILABLE:
      "Billing access could not be verified. Please try again.",
    BILLING_OWNER_REQUIRED:
      "The workspace owner must finish setting up their account before access can be verified.",
    MONGODB_REQUIRED:
      "MongoDB must be configured before authenticated accounts can use the app.",
    NOT_FOUND: "The requested record was not found.",
    DAY_FINALIZED: "This day has already been finalized. Add a correction instead.",
    DAY_NOT_FINALIZED: "This day is still open. Edit the record instead.",
    ALREADY_INVITED: "That reviewer already has access or a pending invitation.",
    HARD_DELETE_DISABLED: "Hard deletion is disabled in workspace settings.",
    ARRANGEMENT_CONFLICT:
      "One or more dates already have a special arrangement.",
    INVALID_ARRANGEMENT_CHILDREN:
      "Assign one or more caregivers to every active child.",
    INVALID_ARRANGEMENT_CAREGIVER:
      "One of the selected caregivers is no longer available.",
    INVALID_ARRANGEMENT_TASK:
      "One of the planned tasks is no longer available.",
    INVALID_CARE_TASK: "Choose either a routine task or a special-arrangement task.",
    INVALID_CAREGIVER_ATTRIBUTION:
      "Completed and partial records require a care provider; missed and not applicable records cannot assign one.",
    INVALID_NON_OCCURRENCE_DETAILS:
      "Missed and not applicable records cannot include duration or activity details.",
    ATTACHMENT_TYPE:
      "Only JPEG, PNG, HEIC, PDF, MP4, MOV, and WebM files are accepted.",
    ATTACHMENT_TOO_LARGE:
      "Images and PDFs must be 15 MB or smaller; videos must be 50 MB or smaller.",
    ATTACHMENT_LIMIT: "Each record can have up to five attachments.",
    ATTACHMENT_PATH: "The attachment upload could not be verified.",
    ATTACHMENT_MISMATCH: "The uploaded file did not match the selected file.",
    ATTACHMENT_MISSING: "The uploaded file could not be found.",
    ATTACHMENT_CONFLICT: "That attachment has already been used.",
  };
  return { ok: false, error: safe[message] ?? (process.env.NODE_ENV === "production" ? "The request could not be completed." : message) };
}

function validationFailure(error: { flatten(): { fieldErrors: Record<string, string[]> } }): ActionResult<never> {
  return { ok: false, error: "Check the highlighted fields.", fieldErrors: error.flatten().fieldErrors };
}

function refreshRecords() {
  revalidatePath("/app");
  revalidatePath("/app/timeline");
  revalidatePath("/app/appointments");
  revalidatePath("/app/incidents");
  revalidatePath("/app/reports");
  revalidatePath("/app/settings");
  revalidatePath("/app/special-days");
}

export async function createCareEntryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = careEntrySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const { templateItemId, arrangementTaskId, taskLabel } = parsed.data;
    const source = templateItemId
      ? ({ kind: "routine", templateItemId } as const)
      : arrangementTaskId
        ? ({ kind: "special_arrangement", arrangementTaskId } as const)
        : ({ kind: "custom", label: taskLabel } as const);
    const entry = await createDaybookService(repository, context).createCareEntry({
      ...parsed.data,
      source,
    });
    refreshRecords();
    return { ok: true, data: { id: entry.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function correctCareEntryAction(
  input: unknown,
): Promise<ActionResult<{ revisionId: string }>> {
  const parsed = careEntryCorrectionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const revision = await createDaybookService(
      repository,
      context,
    ).correctCareEntry(parsed.data);
    refreshRecords();
    return { ok: true, data: { revisionId: revision.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCareEntryAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = careEntryUpdateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const entry = await createDaybookService(repository, context).updateCareEntry(
      parsed.data,
    );
    refreshRecords();
    return { ok: true, data: { id: entry.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCareEntryNotesAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = careEntryTextUpdateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const bundle = await repository.getRecordBundle(context, "care_entry", parsed.data.recordId);
    if (!bundle || !("dailyLogId" in bundle.record)) throw new Error("NOT_FOUND");
    const recordsProvidedCare = careStatusRecordsProvidedCare(bundle.record.status);
    const entry = await createDaybookService(repository, context).updateCareEntry({
      recordId: bundle.record.id,
      childIds: bundle.record.childIds,
      caregiverIds: recordsProvidedCare ? bundle.record.caregiverIds : [],
      status: bundle.record.status,
      occurredAt: bundle.record.occurredAt,
      durationMinutes: recordsProvidedCare ? bundle.record.durationMinutes : undefined,
      activityType: recordsProvidedCare ? bundle.record.activityType : undefined,
      notes: parsed.data.notes,
    });
    refreshRecords();
    return { ok: true, data: { id: entry.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateDailyLogNotesAction(
  input: unknown,
): Promise<ActionResult<{ notes?: string }>> {
  const parsed = dailyLogNotesSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const log = await createDaybookService(repository, context).updateDayNotes(
      parsed.data,
    );
    refreshRecords();
    return { ok: true, data: { notes: log.notes } };
  } catch (error) {
    return fail(error);
  }
}

export async function createAppointmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const appointment = await repository.createAppointment(context, parsed.data);
    refreshRecords();
    return { ok: true, data: { id: appointment.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function createIncidentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = incidentSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const incident = await repository.createIncident(context, parsed.data);
    refreshRecords();
    return { ok: true, data: { id: incident.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function correctRecordAction(input: unknown): Promise<ActionResult<{ revisionId: string }>> {
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const revision = await repository.correctRecord(context, parsed.data);
    refreshRecords();
    return { ok: true, data: { revisionId: revision.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function finalizeDailyLogAction(localDate: string): Promise<ActionResult<{ finalizedAt?: string }>> {
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const log = await createDaybookService(repository, context).finalizeDay(
      localDate,
    );
    refreshRecords();
    return { ok: true, data: { finalizedAt: log.finalizedAt } };
  } catch (error) {
    return fail(error);
  }
}

export async function createSpecialArrangementAction(
  input: unknown,
): Promise<ActionResult<{ seriesId: string; dayIds: string[] }>> {
  const parsed = specialArrangementCreateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const days = await repository.createSpecialArrangement(context, parsed.data);
    refreshRecords();
    return {
      ok: true,
      data: {
        seriesId: days[0]?.seriesId ?? "",
        dayIds: days.map((day) => day.id),
      },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function updateSpecialArrangementAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = specialArrangementUpdateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const arrangement = await repository.updateSpecialArrangement(
      context,
      parsed.data,
    );
    refreshRecords();
    return { ok: true, data: { id: arrangement.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function correctSpecialArrangementAction(
  input: unknown,
): Promise<ActionResult<{ revisionId: string }>> {
  const parsed = specialArrangementCorrectionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const revision = await repository.correctSpecialArrangement(
      context,
      parsed.data,
    );
    refreshRecords();
    return { ok: true, data: { revisionId: revision.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function generateReportAction(input: unknown): Promise<ActionResult<{ reportId: string; workflowRunId?: string }>> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const report = await repository.createReport(context, parsed.data);
    let workflowRunId: string | undefined;

    if (process.env.VERCEL) {
      const { start } = await import("workflow/api");
      const run = await start(generateReportWorkflow, [{ context, reportId: report.id }]);
      workflowRunId = run.runId;
    } else {
      const source = await repository.getReportSource(context, report.id);
      if (!source) throw new Error("REPORT_NOT_FOUND");
      const artifacts = await generateEvidencePackage(source);
      await repository.markReportReady(context, report.id, artifacts);
    }

    revalidatePath("/app/reports");
    return { ok: true, data: { reportId: report.id, workflowRunId } };
  } catch (error) {
    return fail(error);
  }
}

export async function prepareAttachmentUploadAction(
  input: unknown,
): Promise<ActionResult<PreparedAttachmentUpload>> {
  const parsed = attachmentUploadRequestSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const context = await getRequestContext();
    const prepared = await prepareAttachmentUpload(context, parsed.data);
    return { ok: true, data: prepared };
  } catch (error) {
    return fail(error);
  }
}

export async function finalizeAttachmentUploadAction(
  input: unknown,
): Promise<ActionResult<{ attachmentId: string }>> {
  const parsed = attachmentUploadClaimSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const context = await getRequestContext();
    const attachment = await completeAttachmentUpload(context, parsed.data);
    refreshRecords();
    return { ok: true, data: { attachmentId: attachment.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function uploadAttachmentAction(
  formData: FormData,
): Promise<ActionResult<{ attachmentId: string }>> {
  try {
    if (blobConfigured()) {
      return { ok: false, error: "Direct upload is required for configured private storage." };
    }
    const serializedClaim = formData.get("claim")?.toString();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
    if (!serializedClaim) return { ok: false, error: "The attachment upload could not be verified." };
    const claim = attachmentUploadClaimSchema.parse(JSON.parse(serializedClaim)) as AttachmentUploadClaim;
    if (file.size !== claim.declaredSize) throw new Error("ATTACHMENT_MISMATCH");
    const context = await getRequestContext();
    await putPrivateFile(
      claim.pathname,
      new Uint8Array(await file.arrayBuffer()),
      claim.declaredContentType,
    );
    const attachment = await completeAttachmentUpload(context, claim);
    refreshRecords();
    return { ok: true, data: { attachmentId: attachment.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateSettingsAction(
  input: unknown,
): Promise<ActionResult<{ template: RoutineTemplate; children: Child[]; caregivers: Caregiver[] }>> {
  const parsed = workspaceSettingsSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const today = localDateInTimezone(new Date(), parsed.data.timezone);
    if (parsed.data.children.some((child) => child.birthdate > today)) {
      return { ok: false, error: "Birthdates cannot be in the future." };
    }
    const repository = await getRepository();
    const context = await getRequestContext();
    const settings = await repository.updateSettings(context, parsed.data);
    refreshRecords();
    return {
      ok: true,
      data: {
        template: settings.template,
        children: settings.children,
        caregivers: settings.caregivers,
      },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function inviteReviewerAction(input: unknown): Promise<ActionResult<{ memberId: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const member = await repository.inviteReviewer(context, parsed.data);
    if (clerkConfigured()) {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      await client.invitations.createInvitation({
        emailAddress: parsed.data.email,
        redirectUrl: new URL(
          "/app",
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        ).toString(),
        publicMetadata: { workspaceId: context.workspace.id, role: "reviewer" },
      });
    }
    revalidatePath("/app/settings");
    return { ok: true, data: { memberId: member.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function revokeReviewerAction(memberId: string): Promise<ActionResult> {
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    await repository.revokeReviewer(context, memberId);
    revalidatePath("/app/settings");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function hardPurgeAction(input: unknown): Promise<ActionResult> {
  const parsed = purgeSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const bundle = await repository.getRecordBundle(context, parsed.data.recordType, parsed.data.recordId);
    if (!bundle) throw new Error("NOT_FOUND");
    const revisionIds = bundle.revisions.map((revision) => revision.id);
    const reports = (await repository.getReports(context)).filter((report) =>
      report.recordRevisionIds.some((revisionId) => revisionIds.includes(revisionId)),
    );
    await repository.hardPurge(context, parsed.data);
    await deletePrivateFiles([
      ...bundle.attachments.map((attachment) => attachment.pathname),
      ...reports.flatMap((report) => [report.pdfPathname, report.zipPathname].filter(Boolean) as string[]),
    ]);
    refreshRecords();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
