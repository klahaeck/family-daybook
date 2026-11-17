import type { Attachment } from "@/lib/domain/types";

export function reportAttachmentPath(attachment: Attachment): string {
  const safeName = attachment.originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `attachments/${attachment.id}-${safeName}`;
}
