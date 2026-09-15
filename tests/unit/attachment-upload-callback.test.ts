import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/account/deletion-state", () => ({
  accountDeletionStarted: vi.fn(),
}));
vi.mock("@/lib/repository", () => ({
  getRepository: vi.fn(),
}));
vi.mock("@/lib/storage/private-files", () => ({
  blobConfigured: vi.fn(() => true),
  deletePrivateFiles: vi.fn(),
  getPrivateFileStream: vi.fn(),
}));

import { accountDeletionStarted } from "@/lib/account/deletion-state";
import { getRepository } from "@/lib/repository";
import {
  completeAttachmentUploadFromCallback,
  prepareAttachmentUpload,
} from "@/lib/storage/attachment-uploads";
import { deletePrivateFiles } from "@/lib/storage/private-files";

const claim = {
  attachmentId: "attachment_1",
  recordType: "incident" as const,
  recordId: "incident_1",
  pathname: "attachments/workspace_1/incident_1/attachment_1.pdf",
  originalName: "report.pdf",
  declaredContentType: "application/pdf" as const,
  declaredSize: 100,
  workspaceId: "workspace_1",
  uploadedBy: "member_1",
  identity: {
    authUserId: "user_1",
    email: "owner@example.com",
    displayName: "Owner",
    mfaEnabled: true,
    demo: false,
  },
};

describe("attachment upload-completed deletion race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(deletePrivateFiles).mockResolvedValue(undefined);
  });

  it("fails presigned preparation closed when no verified completion callback is configured", async () => {
    const uploadClaim = {
      attachmentId: claim.attachmentId,
      recordType: claim.recordType,
      recordId: claim.recordId,
      pathname: claim.pathname,
      originalName: claim.originalName,
      declaredContentType: claim.declaredContentType,
      declaredSize: claim.declaredSize,
    };
    vi.mocked(getRepository).mockResolvedValue({
      getOperationResult: vi.fn().mockResolvedValue({ found: true, result: uploadClaim }),
      getRecordBundle: vi.fn().mockResolvedValue({
        record: { currentRevisionId: "revision_1" },
        attachments: [],
      }),
    } as never);

    await expect(prepareAttachmentUpload({
      identity: claim.identity,
      workspace: { id: claim.workspaceId },
      member: { id: claim.uploadedBy, role: "owner" },
    } as never, {
      recordType: claim.recordType,
      recordId: claim.recordId,
      originalName: claim.originalName,
      declaredContentType: claim.declaredContentType,
      declaredSize: claim.declaredSize,
    })).rejects.toThrow("ATTACHMENT_CALLBACK");
  });

  it("deletes the just-uploaded blob and acknowledges the callback when account deletion fenced context resolution", async () => {
    const resolveContext = vi.fn().mockRejectedValue(new Error("ACCOUNT_DELETION_IN_PROGRESS"));
    vi.mocked(getRepository).mockResolvedValue({ resolveContext } as never);
    vi.mocked(accountDeletionStarted).mockResolvedValue(true);

    await expect(
      completeAttachmentUploadFromCallback(claim, claim.pathname),
    ).resolves.toBeUndefined();

    expect(resolveContext).toHaveBeenCalledWith(claim.identity);
    expect(accountDeletionStarted).toHaveBeenCalledWith("user_1");
    expect(deletePrivateFiles).toHaveBeenCalledWith([claim.pathname]);
  });

  it("does not delete a blob for a transient context error without a deletion fence", async () => {
    vi.mocked(getRepository).mockResolvedValue({
      resolveContext: vi.fn().mockRejectedValue(new Error("MONGODB_REQUIRED")),
    } as never);
    vi.mocked(accountDeletionStarted).mockResolvedValue(false);

    await expect(
      completeAttachmentUploadFromCallback(claim, claim.pathname),
    ).rejects.toThrow("MONGODB_REQUIRED");
    expect(deletePrivateFiles).not.toHaveBeenCalled();
  });

  it("never deletes the claimed blob when the provider reports a different pathname", async () => {
    vi.mocked(accountDeletionStarted).mockResolvedValue(true);

    await expect(
      completeAttachmentUploadFromCallback(claim, "attachments/workspace_1/other.pdf"),
    ).rejects.toThrow("ATTACHMENT_PATH");
    expect(getRepository).not.toHaveBeenCalled();
    expect(deletePrivateFiles).not.toHaveBeenCalled();
  });
});
