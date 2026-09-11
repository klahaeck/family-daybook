import { describe, expect, it } from "vitest";

import {
  attachmentExtension,
  attachmentTypeForFile,
  isAttachmentContentType,
  maxAttachmentBytes,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_VIDEO_ATTACHMENT_BYTES,
} from "@/lib/domain/attachments";

describe("attachment policy", () => {
  it("accepts the supported image, document, and video formats", () => {
    expect(isAttachmentContentType("image/jpeg")).toBe(true);
    expect(isAttachmentContentType("application/pdf")).toBe(true);
    expect(isAttachmentContentType("video/mp4")).toBe(true);
    expect(isAttachmentContentType("video/quicktime")).toBe(true);
    expect(isAttachmentContentType("video/webm")).toBe(true);
    expect(isAttachmentContentType("video/x-msvideo")).toBe(false);
  });

  it("uses the declared type or a known filename extension", () => {
    expect(attachmentTypeForFile({ name: "clip.bin", type: "video/mp4" })).toBe(
      "video/mp4",
    );
    expect(attachmentTypeForFile({ name: "phone-clip.MOV", type: "" })).toBe(
      "video/quicktime",
    );
    expect(attachmentTypeForFile({ name: "notes.exe", type: "" })).toBeUndefined();
  });

  it("applies separate document and video size ceilings", () => {
    expect(maxAttachmentBytes("application/pdf")).toBe(
      MAX_DOCUMENT_ATTACHMENT_BYTES,
    );
    expect(maxAttachmentBytes("video/webm")).toBe(MAX_VIDEO_ATTACHMENT_BYTES);
    expect(attachmentExtension("video/quicktime")).toBe("mov");
  });
});
