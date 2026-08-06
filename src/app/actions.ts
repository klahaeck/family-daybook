"use server";

import { revalidatePath } from "next/cache";
import { fileTypeFromBuffer } from "file-type";

import { clerkConfigured } from "@/lib/auth/identity";
import { isValidLocalDate, localDateInTimezone } from "@/lib/domain/dates";
import { id, sha256 } from "@/lib/domain/integrity";
import {
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
import type { ActionResult, Attachment, Caregiver, Child, RecordType, RoutineTemplate } from "@/lib/domain/types";
import { getRepository, getRequestContext } from "@/lib/repository";
import { generateEvidencePackage } from "@/lib/reporting/generate-package";
import { deletePrivateFiles, putPrivateFile } from "@/lib/storage/private-files";
import { generateReportWorkflow } from "@/workflows/generate-report";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "application/pdf",
]);

function fail(error: unknown): ActionResult<never> {
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
    const today = localDateInTimezone(new Date(), context.workspace.timezone);
    if (parsed.data.localDate > today) {
      return { ok: false, error: "Care records cannot be added to a future date." };
    }
    if (localDateInTimezone(new Date(parsed.data.occurredAt), context.workspace.timezone) !== parsed.data.localDate) {
      return { ok: false, error: "The occurrence time must fall on the selected log date." };
    }
    const entry = await repository.createCareEntry(context, parsed.data);
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
    const bundle = await repository.getRecordBundle(context, "care_entry", parsed.data.recordId);
    if (!bundle || !("dailyLogId" in bundle.record)) throw new Error("NOT_FOUND");

    const today = localDateInTimezone(new Date(), context.workspace.timezone);
    const originalDate = localDateInTimezone(
      new Date(bundle.record.occurredAt),
      context.workspace.timezone,
    );
    const correctedDate = localDateInTimezone(
      new Date(parsed.data.occurredAt),
      context.workspace.timezone,
    );
    if (correctedDate > today) {
      return { ok: false, error: "Care records cannot be moved to a future date." };
    }
    if (correctedDate !== originalDate) {
      return { ok: false, error: "The corrected time must stay on the original log date." };
    }
    const revision = await repository.correctCareEntry(context, parsed.data);
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
    const bundle = await repository.getRecordBundle(context, "care_entry", parsed.data.recordId);
    if (!bundle || !("dailyLogId" in bundle.record)) throw new Error("NOT_FOUND");

    const today = localDateInTimezone(new Date(), context.workspace.timezone);
    const originalDate = localDateInTimezone(
      new Date(bundle.record.occurredAt),
      context.workspace.timezone,
    );
    const updatedDate = localDateInTimezone(
      new Date(parsed.data.occurredAt),
      context.workspace.timezone,
    );
    if (updatedDate > today) {
      return { ok: false, error: "Care records cannot be moved to a future date." };
    }
    if (updatedDate !== originalDate) {
      return { ok: false, error: "The updated time must stay on the original log date." };
    }
    const entry = await repository.updateCareEntry(context, parsed.data);
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
    const entry = await repository.updateCareEntry(context, {
      recordId: bundle.record.id,
      childIds: bundle.record.childIds,
      caregiverIds: bundle.record.caregiverIds,
      status: bundle.record.status,
      occurredAt: bundle.record.occurredAt,
      durationMinutes: bundle.record.durationMinutes,
      activityType: bundle.record.activityType,
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
    const today = localDateInTimezone(new Date(), context.workspace.timezone);
    if (parsed.data.localDate > today) {
      return { ok: false, error: "Day notes cannot be added to a future date." };
    }
    const log = await repository.updateDailyLogNotes(context, parsed.data);
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
    if (!isValidLocalDate(localDate) || localDate > localDateInTimezone(new Date(), context.workspace.timezone)) {
      return { ok: false, error: "Choose today or an earlier valid date." };
    }
    const log = await repository.finalizeDailyLog(context, localDate);
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

export async function uploadAttachmentAction(formData: FormData): Promise<ActionResult<{ attachmentId: string }>> {
  try {
    const recordType = formData.get("recordType")?.toString() as RecordType;
    const recordId = formData.get("recordId")?.toString();
    const file = formData.get("file");
    if (!recordId || !["care_entry", "appointment", "incident"].includes(recordType)) {
      return { ok: false, error: "Choose a valid record." };
    }
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
    if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: "Files must be 15 MB or smaller." };

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(bytes);
    const contentType = detected?.mime ?? "";
    if (!ALLOWED_TYPES.has(contentType)) {
      return { ok: false, error: "Only JPEG, PNG, HEIC, and PDF files are accepted." };
    }

    const repository = await getRepository();
    const context = await getRequestContext();
    if (context.member.role !== "owner") throw new Error("FORBIDDEN");
    const bundle = await repository.getRecordBundle(context, recordType, recordId);
    if (!bundle) throw new Error("NOT_FOUND");
    if (bundle.attachments.length >= 5) return { ok: false, error: "Each record can have up to five attachments." };

    const attachmentId = id("attachment");
    const extension = detected?.ext === "jpg" ? "jpg" : detected?.ext ?? "bin";
    const pathname = await putPrivateFile(
      `attachments/${context.workspace.id}/${recordId}/${attachmentId}.${extension}`,
      bytes,
      contentType,
    );
    const attachment: Attachment = {
      id: attachmentId,
      workspaceId: context.workspace.id,
      recordType,
      recordId,
      revisionId: bundle.record.currentRevisionId,
      originalName: file.name.slice(0, 180),
      contentType: contentType as Attachment["contentType"],
      size: file.size,
      sha256: sha256(bytes),
      pathname,
      uploadedAt: new Date().toISOString(),
      uploadedBy: context.member.id,
    };
    await repository.addAttachment(context, attachment);
    refreshRecords();
    return { ok: true, data: { attachmentId } };
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
