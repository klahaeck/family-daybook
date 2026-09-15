import type { RecordBundle } from "@family-daybook/contracts";

type AttachmentContentType = RecordBundle["attachments"][number]["contentType"];

const supportedTypes = new Set<AttachmentContentType>([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const typesByExtension: Record<string, AttachmentContentType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export const documentPickerTypes = [...supportedTypes];

export function attachmentContentType(name: string, reportedType?: string): AttachmentContentType | undefined {
  const normalized = reportedType?.toLowerCase() === "image/jpg" ? "image/jpeg" : reportedType?.toLowerCase();
  if (normalized && supportedTypes.has(normalized as AttachmentContentType)) {
    return normalized as AttachmentContentType;
  }
  const extension = name.split(".").pop()?.toLowerCase();
  return extension ? typesByExtension[extension] : undefined;
}
