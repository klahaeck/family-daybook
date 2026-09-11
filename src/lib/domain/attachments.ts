export const MAX_ATTACHMENTS_PER_RECORD = 5;
export const MAX_DOCUMENT_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export const DOCUMENT_ATTACHMENT_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "application/pdf",
] as const;

export const VIDEO_ATTACHMENT_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const ATTACHMENT_CONTENT_TYPES = [
  ...DOCUMENT_ATTACHMENT_CONTENT_TYPES,
  ...VIDEO_ATTACHMENT_CONTENT_TYPES,
] as const;

export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number];
export type AttachmentUploadMode = "local" | "presigned";

export interface AttachmentUploadClaim {
  attachmentId: string;
  recordType: "care_entry" | "appointment" | "incident";
  recordId: string;
  pathname: string;
  originalName: string;
  declaredContentType: AttachmentContentType;
  declaredSize: number;
}

export interface PreparedAttachmentUpload {
  mode: AttachmentUploadMode;
  claim: AttachmentUploadClaim;
  presignedUrl?: string;
}

export function isAttachmentContentType(value: string): value is AttachmentContentType {
  return (ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(value);
}

export function isVideoAttachmentType(contentType: string): boolean {
  return (VIDEO_ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(contentType);
}

export function maxAttachmentBytes(contentType: string): number {
  return isVideoAttachmentType(contentType)
    ? MAX_VIDEO_ATTACHMENT_BYTES
    : MAX_DOCUMENT_ATTACHMENT_BYTES;
}

export function attachmentExtension(contentType: AttachmentContentType): string {
  const extensions: Record<AttachmentContentType, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "application/pdf": "pdf",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  return extensions[contentType];
}

export function attachmentTypeForFile(file: Pick<File, "name" | "type">): AttachmentContentType | undefined {
  if (isAttachmentContentType(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const byExtension: Record<string, AttachmentContentType> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    heic: "image/heic",
    pdf: "application/pdf",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };
  return extension ? byExtension[extension] : undefined;
}

export function formatAttachmentSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function attachmentTypeLabel(contentType: AttachmentContentType): string {
  const labels: Record<AttachmentContentType, string> = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/heic": "HEIC",
    "application/pdf": "PDF",
    "video/mp4": "MP4",
    "video/quicktime": "MOV",
    "video/webm": "WebM",
  };
  return labels[contentType];
}
