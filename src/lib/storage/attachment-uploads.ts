import "server-only";

import { issueSignedToken, presignUrl } from "@vercel/blob";
import { createHash } from "node:crypto";
import { fileTypeStream } from "file-type";
import { z } from "zod";

import {
  attachmentExtension,
  ATTACHMENT_CONTENT_TYPES,
  isAttachmentContentType,
  maxAttachmentBytes,
  MAX_ATTACHMENTS_PER_RECORD,
  type AttachmentUploadClaim,
  type PreparedAttachmentUpload,
} from "@/lib/domain/attachments";
import {
  attachmentUploadClaimSchema,
  attachmentUploadRequestSchema,
} from "@/lib/domain/schemas";
import { id } from "@/lib/domain/integrity";
import type { Attachment } from "@/lib/domain/types";
import type { Identity } from "@/lib/auth/identity";
import { getRepository } from "@/lib/repository";
import type { RequestContext } from "@/lib/repository/repository";
import {
  blobConfigured,
  deletePrivateFiles,
  getPrivateFileStream,
} from "@/lib/storage/private-files";

const CALLBACK_CLAIM_SCHEMA = attachmentUploadClaimSchema.extend({
  workspaceId: z.string().min(1),
  uploadedBy: z.string().min(1),
  identity: z.object({
    authUserId: z.string().min(1),
    email: z.string().email(),
    displayName: z.string().min(1),
    mfaEnabled: z.boolean(),
    demo: z.boolean(),
  }),
});

export type AttachmentUploadRequest = z.infer<typeof attachmentUploadRequestSchema>;
export type AttachmentUploadCallbackClaim = z.infer<typeof CALLBACK_CLAIM_SCHEMA>;

function attachmentError(contentType: string, size: number): string | undefined {
  if (!isAttachmentContentType(contentType)) return "ATTACHMENT_TYPE";
  if (size > maxAttachmentBytes(contentType)) return "ATTACHMENT_TOO_LARGE";
  return undefined;
}

function expectedPathname(context: RequestContext, claim: AttachmentUploadClaim): string {
  return `attachments/${context.workspace.id}/${claim.recordId}/${claim.attachmentId}.${attachmentExtension(claim.declaredContentType)}`;
}

function callbackUrl(): string | undefined {
  const explicit = process.env.VERCEL_BLOB_CALLBACK_URL;
  const host =
    process.env.VERCEL_BRANCH_URL ??
    process.env.VERCEL_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.NEXT_PUBLIC_APP_URL;
  const base = explicit ?? host;
  if (!base) return undefined;
  const normalized = /^[a-z]+:\/\//i.test(base) ? base : `https://${base}`;
  return new URL("/api/attachments/upload-completed", normalized).toString();
}

async function validateClaim(
  context: RequestContext,
  claim: AttachmentUploadClaim,
): Promise<void> {
  if (context.member.role !== "owner") throw new Error("FORBIDDEN");
  const policyError = attachmentError(claim.declaredContentType, claim.declaredSize);
  if (policyError) throw new Error(policyError);
  if (claim.pathname !== expectedPathname(context, claim)) {
    throw new Error("ATTACHMENT_PATH");
  }
  const repository = await getRepository();
  const bundle = await repository.getRecordBundle(
    context,
    claim.recordType,
    claim.recordId,
  );
  if (!bundle) throw new Error("NOT_FOUND");
  const existing = bundle.attachments.find((attachment) => attachment.id === claim.attachmentId);
  if (existing) {
    if (existing.pathname !== claim.pathname) throw new Error("ATTACHMENT_CONFLICT");
    return;
  }
  if (bundle.attachments.length >= MAX_ATTACHMENTS_PER_RECORD) {
    throw new Error("ATTACHMENT_LIMIT");
  }
}

export async function prepareAttachmentUpload(
  context: RequestContext,
  input: AttachmentUploadRequest,
): Promise<PreparedAttachmentUpload> {
  const parsed = attachmentUploadRequestSchema.parse(input);
  const policyError = attachmentError(parsed.declaredContentType, parsed.declaredSize);
  if (policyError) throw new Error(policyError);

  const attachmentId = id("attachment");
  const claim: AttachmentUploadClaim = {
    ...parsed,
    attachmentId,
    pathname: `attachments/${context.workspace.id}/${parsed.recordId}/${attachmentId}.${attachmentExtension(parsed.declaredContentType)}`,
  };
  await validateClaim(context, claim);

  if (!blobConfigured()) return { mode: "local", claim };

  const validUntil = Date.now() + 5 * 60 * 1000;
  const token = await issueSignedToken({
    pathname: claim.pathname,
    operations: ["put"],
    validUntil,
    allowedContentTypes: [claim.declaredContentType],
    maximumSizeInBytes: maxAttachmentBytes(claim.declaredContentType),
  });
  const completionUrl = process.env.BLOB_WEBHOOK_PUBLIC_KEY
    ? callbackUrl()
    : undefined;
  const signedClaim: AttachmentUploadCallbackClaim = {
    ...claim,
    workspaceId: context.workspace.id,
    uploadedBy: context.member.id,
    identity: context.identity,
  };
  const { presignedUrl } = await presignUrl(token, {
    access: "private",
    operation: "put",
    pathname: claim.pathname,
    validUntil,
    allowedContentTypes: [claim.declaredContentType],
    maximumSizeInBytes: maxAttachmentBytes(claim.declaredContentType),
    allowOverwrite: false,
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
    onUploadCompleted: completionUrl
      ? {
          callbackUrl: completionUrl,
          tokenPayload: JSON.stringify(signedClaim),
        }
      : undefined,
  });
  return { mode: "presigned", claim, presignedUrl };
}

async function detectedAttachment(
  pathname: string,
): Promise<{ contentType: Attachment["contentType"]; size: number; sha256: string }> {
  const file = await getPrivateFileStream(pathname);
  if (!file) throw new Error("ATTACHMENT_MISSING");
  let typedStream;
  try {
    typedStream = await fileTypeStream(file.stream);
  } catch {
    throw new Error("ATTACHMENT_TYPE");
  }
  const detected = typedStream.fileType;
  if (!detected || !isAttachmentContentType(detected.mime)) {
    throw new Error("ATTACHMENT_TYPE");
  }
  const hash = createHash("sha256");
  const reader = typedStream.getReader();
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
    size += value.byteLength;
  }
  return { contentType: detected.mime, size, sha256: hash.digest("hex") };
}

export async function completeAttachmentUpload(
  context: RequestContext,
  input: unknown,
  actualPathname?: string,
): Promise<Attachment> {
  const claim = attachmentUploadClaimSchema.parse(input);
  await validateClaim(context, claim);
  if (actualPathname && actualPathname !== claim.pathname) {
    throw new Error("ATTACHMENT_PATH");
  }
  const repository = await getRepository();
  const existing = await repository.getAttachment(context, claim.attachmentId);
  if (existing) {
    if (
      existing.recordType !== claim.recordType ||
      existing.recordId !== claim.recordId ||
      existing.pathname !== claim.pathname
    ) {
      throw new Error("ATTACHMENT_CONFLICT");
    }
    return existing;
  }

  try {
    const bundle = await repository.getRecordBundle(
      context,
      claim.recordType,
      claim.recordId,
    );
    if (!bundle) throw new Error("NOT_FOUND");
    const bundled = bundle.attachments.find((attachment) => attachment.id === claim.attachmentId);
    if (bundled) return bundled;
    if (bundle.attachments.length >= MAX_ATTACHMENTS_PER_RECORD) {
      throw new Error("ATTACHMENT_LIMIT");
    }

    const detected = await detectedAttachment(claim.pathname);
    if (
      detected.contentType !== claim.declaredContentType ||
      detected.size !== claim.declaredSize ||
      detected.size > maxAttachmentBytes(detected.contentType)
    ) {
      throw new Error("ATTACHMENT_MISMATCH");
    }

    const attachment: Attachment = {
      id: claim.attachmentId,
      workspaceId: context.workspace.id,
      recordType: claim.recordType,
      recordId: claim.recordId,
      revisionId: bundle.record.currentRevisionId,
      originalName: claim.originalName,
      contentType: detected.contentType,
      size: detected.size,
      sha256: detected.sha256,
      pathname: claim.pathname,
      uploadedAt: new Date().toISOString(),
      uploadedBy: context.member.id,
    };
    await repository.addAttachment(context, attachment);
    return (await repository.getAttachment(context, attachment.id)) ?? attachment;
  } catch (error) {
    const completed = await repository.getAttachment(context, claim.attachmentId);
    if (!completed) await deletePrivateFiles([claim.pathname]);
    if (completed) return completed;
    throw error;
  }
}

export function parseAttachmentCallbackClaim(value: string | null | undefined) {
  if (!value) throw new Error("ATTACHMENT_CALLBACK");
  return CALLBACK_CLAIM_SCHEMA.parse(JSON.parse(value));
}

export async function completeAttachmentUploadFromCallback(
  claim: AttachmentUploadCallbackClaim,
  actualPathname: string,
): Promise<Attachment> {
  const repository = await getRepository();
  const identity: Identity = claim.identity;
  const context = await repository.resolveContext(identity);
  if (
    context.workspace.id !== claim.workspaceId ||
    context.member.id !== claim.uploadedBy ||
    context.member.role !== "owner"
  ) {
    throw new Error("FORBIDDEN");
  }
  return completeAttachmentUpload(context, claim, actualPathname);
}

export function acceptedAttachmentTypes(): readonly string[] {
  return ATTACHMENT_CONTENT_TYPES;
}
