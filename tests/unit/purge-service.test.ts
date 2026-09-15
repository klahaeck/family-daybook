import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/private-files", () => ({
  deletePrivateFiles: vi.fn(),
}));

import { purgeRecord } from "@/lib/application/purge-service";
import type { PurgeTombstone } from "@/lib/domain/types";
import type { ParentingRepository, RequestContext } from "@/lib/repository/repository";
import { deletePrivateFiles } from "@/lib/storage/private-files";

const context = {} as RequestContext;
const tombstone: PurgeTombstone = {
  id: "purge_123",
  workspaceId: "workspace_123",
  recordType: "incident",
  recordId: "incident_123",
  priorHashes: ["hash_123"],
  cleanupPathnames: ["attachments/workspace_123/incident_123/evidence.pdf"],
  reason: "This fixture is permanently removed for a retry test.",
  purgedBy: "member_123",
  purgedAt: "2026-09-15T12:00:00.000Z",
};

describe("purgeRecord", () => {
  beforeEach(() => vi.resetAllMocks());

  it("retries durable cleanup paths after the database purge has committed", async () => {
    const getOperationResult = vi
      .fn()
      .mockResolvedValueOnce({ found: false })
      .mockResolvedValueOnce({ found: true, result: tombstone });
    const hardPurge = vi.fn().mockResolvedValue(tombstone);
    const repository = {
      getOperationResult,
      hardPurge,
    } as unknown as ParentingRepository;
    vi.mocked(deletePrivateFiles)
      .mockRejectedValueOnce(new Error("blob temporarily unavailable"))
      .mockResolvedValueOnce(undefined);
    const input = {
      recordType: "incident" as const,
      recordId: "incident_123",
      reason: tombstone.reason,
    };

    await expect(purgeRecord(repository, context, input)).rejects.toThrow(
      "blob temporarily unavailable",
    );
    await expect(purgeRecord(repository, context, input)).resolves.toEqual(
      tombstone,
    );

    expect(hardPurge).toHaveBeenCalledTimes(1);
    expect(deletePrivateFiles).toHaveBeenCalledTimes(2);
    expect(deletePrivateFiles).toHaveBeenLastCalledWith(
      tombstone.cleanupPathnames ?? [],
    );
  });
});
