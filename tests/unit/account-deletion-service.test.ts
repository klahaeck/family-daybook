import { describe, expect, it, vi } from "vitest";

import {
  deleteApplicationAccount,
  type AccountDeletionState,
  type AccountDeletionStore,
} from "@/lib/application/account-deletion-service";
import type { ParentingRepository, RequestContext } from "@/lib/repository/repository";

const context = {
  identity: { authUserId: "user_123" },
  workspace: { id: "workspace_123" },
  member: { id: "member_123", role: "owner" },
} as RequestContext;

function state(overrides: Partial<AccountDeletionState> = {}): AccountDeletionState {
  const now = new Date("2026-09-15T12:00:00.000Z");
  return {
    id: "deletion_123",
    subjectKey: "subject",
    operationId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "workspace_123",
    memberId: "member_123",
    memberRole: "owner",
    pathnames: ["attachments/workspace_123/file.pdf"],
    redactionId: "redaction_123",
    deletedWorkspace: true,
    billingSubscriptionCanceled: false,
    dataDeleted: false,
    billingCleaned: false,
    filesDeleted: false,
    complete: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class FakeStore implements AccountDeletionStore {
  current: AccountDeletionState | null;
  targetPresent = true;
  failNextMark = false;

  constructor(initial: AccountDeletionState | null = null) {
    this.current = initial;
  }

  async find() {
    return this.current;
  }

  async begin(input: Parameters<AccountDeletionStore["begin"]>[0]) {
    this.current ??= state({
      memberRole: input.context.member.role,
      deletedWorkspace: input.context.member.role === "owner",
      billingSubscriptionCanceled: input.context.member.role === "reviewer",
    });
    return this.current;
  }

  async targetExists() {
    return this.targetPresent;
  }

  async mark(
    current: AccountDeletionState,
    patch: Partial<
      Pick<
        AccountDeletionState,
        | "billingSubscriptionCanceled"
        | "dataDeleted"
        | "billingCleaned"
        | "filesDeleted"
        | "complete"
      >
    >,
  ) {
    if (this.failNextMark) {
      this.failNextMark = false;
      throw new Error("state write failed");
    }
    this.current = { ...current, ...patch };
    return this.current;
  }
}

function loaded(
  deleteAccountData: () => Promise<{ deletedWorkspace: boolean }>,
  callbacks: { onBegin?: () => void; onPaths?: () => void } = {},
) {
  return {
    context,
    repository: {
      beginAccountDeletion: vi.fn(async () => callbacks.onBegin?.()),
      getAccountDeletionPaths: vi.fn(async () => {
        callbacks.onPaths?.();
        return ["attachments/workspace_123/file.pdf"];
      }),
      deleteAccountData,
    } as unknown as ParentingRepository,
  };
}

describe("deleteApplicationAccount", () => {
  it("deletes database data before external files and records each resumable stage", async () => {
    const calls: string[] = [];
    const store = new FakeStore();
    const result = await deleteApplicationAccount(
      "user_123",
      "11111111-1111-4111-8111-111111111111",
      {
        store,
        cancelBilling: async () => {
          calls.push("cancel billing");
        },
        loadContext: async () =>
          loaded(
            async () => {
              calls.push("data");
              return { deletedWorkspace: true };
            },
            {
              onBegin: () => calls.push("fence"),
              onPaths: () => calls.push("paths"),
            },
          ),
        deleteBilling: async () => {
          calls.push("billing");
        },
        deleteFiles: async () => {
          calls.push("files");
        },
      },
    );

    expect(calls).toEqual([
      "fence",
      "paths",
      "cancel billing",
      "data",
      "billing",
      "files",
    ]);
    expect(store.current).toMatchObject({
      billingSubscriptionCanceled: true,
      dataDeleted: true,
      billingCleaned: true,
      filesDeleted: true,
      complete: true,
    });
    expect(result).toEqual({
      applicationDataDeleted: true,
      deletedWorkspace: true,
      deleteClerkIdentity: true,
    });
  });

  it("re-establishes the mutation fence before resuming database deletion", async () => {
    const calls: string[] = [];
    const store = new FakeStore(state({ billingSubscriptionCanceled: true }));
    const account = loaded(
      async () => {
        calls.push("data");
        return { deletedWorkspace: true };
      },
      {
        onBegin: () => calls.push("fence"),
        onPaths: () => calls.push("paths"),
      },
    );

    await deleteApplicationAccount(
      "user_123",
      "11111111-1111-4111-8111-111111111111",
      {
        store,
        loadContext: async () => account,
        deleteBilling: vi.fn().mockResolvedValue(undefined),
        deleteFiles: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(calls).toEqual(["fence", "data"]);
    expect(account.repository.getAccountDeletionPaths).not.toHaveBeenCalled();
  });

  it("does not enumerate or delete data when establishing the fence fails", async () => {
    const store = new FakeStore();
    const deleteData = vi.fn().mockResolvedValue({ deletedWorkspace: true });
    const account = loaded(deleteData);
    vi.mocked(account.repository.beginAccountDeletion).mockRejectedValue(
      new Error("fence failed"),
    );

    await expect(
      deleteApplicationAccount(
        "user_123",
        "11111111-1111-4111-8111-111111111111",
        {
          store,
          loadContext: async () => account,
          deleteBilling: vi.fn().mockResolvedValue(undefined),
          deleteFiles: vi.fn().mockResolvedValue(undefined),
        },
      ),
    ).rejects.toThrow("fence failed");

    expect(account.repository.getAccountDeletionPaths).not.toHaveBeenCalled();
    expect(deleteData).not.toHaveBeenCalled();
  });

  it("resumes file cleanup without reloading a deleted workspace", async () => {
    const store = new FakeStore(
      state({
        billingSubscriptionCanceled: true,
        dataDeleted: true,
        billingCleaned: true,
      }),
    );
    const deleteFiles = vi.fn().mockResolvedValue(undefined);
    const loadContext = vi.fn().mockRejectedValue(new Error("FORBIDDEN"));
    const cancelBilling = vi.fn().mockRejectedValue(new Error("must not rerun"));

    await deleteApplicationAccount(
      "user_123",
      "22222222-2222-4222-8222-222222222222",
      { store, loadContext, cancelBilling, deleteFiles },
    );

    expect(loadContext).not.toHaveBeenCalled();
    expect(cancelBilling).not.toHaveBeenCalled();
    expect(deleteFiles).toHaveBeenCalledWith([
      "attachments/workspace_123/file.pdf",
    ]);
    expect(store.current).toMatchObject({ filesDeleted: true, complete: true });
  });

  it("recovers when data deletion committed but its state update failed", async () => {
    const store = new FakeStore(state({ billingSubscriptionCanceled: true }));
    store.failNextMark = true;
    const deleteData = vi.fn().mockResolvedValue({ deletedWorkspace: true });
    const loadContext = vi.fn().mockResolvedValue(loaded(deleteData));
    const dependencies = {
      store,
      loadContext,
      deleteBilling: vi.fn().mockResolvedValue(undefined),
      deleteFiles: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      deleteApplicationAccount(
        "user_123",
        "11111111-1111-4111-8111-111111111111",
        dependencies,
      ),
    ).rejects.toThrow("state write failed");

    store.targetPresent = false;
    loadContext.mockClear();
    await deleteApplicationAccount(
      "user_123",
      "11111111-1111-4111-8111-111111111111",
      dependencies,
    );

    expect(loadContext).not.toHaveBeenCalled();
    expect(deleteData).toHaveBeenCalledTimes(1);
    expect(store.current).toMatchObject({ dataDeleted: true, complete: true });
  });

  it("does not delete data when owner subscription cancellation fails", async () => {
    const store = new FakeStore();
    const deleteData = vi.fn().mockResolvedValue({ deletedWorkspace: true });
    const deleteBilling = vi.fn().mockResolvedValue(undefined);
    const deleteFiles = vi.fn().mockResolvedValue(undefined);

    await expect(
      deleteApplicationAccount(
        "user_123",
        "11111111-1111-4111-8111-111111111111",
        {
          store,
          loadContext: async () => loaded(deleteData),
          cancelBilling: vi.fn().mockRejectedValue(new Error("Clerk unavailable")),
          deleteBilling,
          deleteFiles,
        },
      ),
    ).rejects.toThrow("Clerk unavailable");

    expect(store.current).toMatchObject({
      billingSubscriptionCanceled: false,
      dataDeleted: false,
      billingCleaned: false,
    });
    expect(deleteData).not.toHaveBeenCalled();
    expect(deleteBilling).not.toHaveBeenCalled();
    expect(deleteFiles).not.toHaveBeenCalled();
  });

  it("does not require Clerk Billing cancellation for reviewer deletion", async () => {
    const reviewerContext = {
      ...context,
      member: { ...context.member, role: "reviewer" },
    } as RequestContext;
    const store = new FakeStore();
    const cancelBilling = vi.fn().mockRejectedValue(new Error("must not run"));

    await deleteApplicationAccount(
      "user_123",
      "11111111-1111-4111-8111-111111111111",
      {
        store,
        loadContext: async () => ({
          context: reviewerContext,
          repository: {
            beginAccountDeletion: vi.fn().mockResolvedValue(undefined),
            getAccountDeletionPaths: vi.fn().mockResolvedValue([]),
            deleteAccountData: vi.fn().mockResolvedValue({
              deletedWorkspace: false,
            }),
          } as unknown as ParentingRepository,
        }),
        cancelBilling,
        deleteBilling: vi.fn().mockResolvedValue(undefined),
        deleteFiles: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(cancelBilling).not.toHaveBeenCalled();
    expect(store.current).toMatchObject({
      memberRole: "reviewer",
      billingSubscriptionCanceled: true,
      complete: true,
    });
  });
});
