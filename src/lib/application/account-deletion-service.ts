import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { Collection, Document } from "mongodb";

import {
  cancelClerkBillingForAuthUser,
  deleteBillingDataForAuthUser,
} from "@/lib/billing/account-cleanup";
import { collection, mongoConfigured } from "@/lib/db/mongodb";
import type {
  ParentingRepository,
  RequestContext,
} from "@/lib/repository/repository";
import { deletePrivateFiles } from "@/lib/storage/private-files";

export interface AccountDeletionState extends Document {
  id: string;
  subjectKey: string;
  operationId: string;
  workspaceId: string;
  memberId: string;
  memberRole: "owner" | "reviewer";
  pathnames: string[];
  redactionId: string;
  deletedWorkspace: boolean;
  billingSubscriptionCanceled: boolean;
  dataDeleted: boolean;
  billingCleaned: boolean;
  filesDeleted: boolean;
  complete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountDeletionStore {
  find(authUserId: string): Promise<AccountDeletionState | null>;
  begin(input: {
    authUserId: string;
    operationId: string;
    context: RequestContext;
    pathnames: string[];
  }): Promise<AccountDeletionState>;
  targetExists(state: AccountDeletionState): Promise<boolean>;
  mark(
    state: AccountDeletionState,
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
  ): Promise<AccountDeletionState>;
}

type LoadedAccountContext = {
  repository: ParentingRepository;
  context: RequestContext;
};

interface AccountDeletionDependencies {
  store?: AccountDeletionStore;
  loadContext: () => Promise<LoadedAccountContext>;
  cancelBilling?: (authUserId: string) => Promise<unknown>;
  deleteBilling?: (
    authUserId: string,
    redactionId: string,
  ) => Promise<unknown>;
  deleteFiles?: (pathnames: string[]) => Promise<void>;
}

export interface AccountDeletionResult {
  applicationDataDeleted: true;
  deletedWorkspace: boolean;
  deleteClerkIdentity: true;
}

function subjectKey(authUserId: string): string {
  return createHash("sha256").update(authUserId, "utf8").digest("hex");
}

export async function deleteApplicationAccount(
  authUserId: string,
  operationId: string,
  dependencies: AccountDeletionDependencies,
): Promise<AccountDeletionResult> {
  const store = dependencies.store ?? new MongoAccountDeletionStore();
  const cancelBilling =
    dependencies.cancelBilling ?? cancelClerkBillingForAuthUser;
  const deleteBilling =
    dependencies.deleteBilling ??
    ((userId: string, redactionId: string) =>
      deleteBillingDataForAuthUser(userId, { redactionId }));
  const deleteFiles = dependencies.deleteFiles ?? deletePrivateFiles;

  let loaded: LoadedAccountContext | undefined;
  let deletionFenced = false;
  let state = await store.find(authUserId);
  if (!state) {
    loaded = await dependencies.loadContext();
    if (loaded.context.identity.authUserId !== authUserId) {
      throw new Error("FORBIDDEN");
    }
    await loaded.repository.beginAccountDeletion(loaded.context);
    deletionFenced = true;
    const pathnames = await loaded.repository.getAccountDeletionPaths(
      loaded.context,
    );
    state = await store.begin({
      authUserId,
      operationId,
      context: loaded.context,
      pathnames,
    });
  }

  if (!state.billingSubscriptionCanceled) {
    if (state.memberRole === "owner") {
      await cancelBilling(authUserId);
    }
    state = await store.mark(state, { billingSubscriptionCanceled: true });
  }

  if (!state.dataDeleted) {
    if (await store.targetExists(state)) {
      loaded ??= await dependencies.loadContext();
      if (!deletionFenced) {
        await loaded.repository.beginAccountDeletion(loaded.context);
        deletionFenced = true;
      }
      const result = await loaded.repository.deleteAccountData(loaded.context);
      if (result.deletedWorkspace !== state.deletedWorkspace) {
        throw new Error("ACCOUNT_DELETION_TARGET_CHANGED");
      }
    }
    state = await store.mark(state, { dataDeleted: true });
  }

  if (!state.billingCleaned) {
    await deleteBilling(authUserId, state.redactionId);
    state = await store.mark(state, { billingCleaned: true });
  }

  if (!state.filesDeleted) {
    await deleteFiles(state.pathnames);
    state = await store.mark(state, { filesDeleted: true });
  }

  if (!state.complete) {
    state = await store.mark(state, { complete: true });
  }

  return {
    applicationDataDeleted: true,
    deletedWorkspace: state.deletedWorkspace,
    deleteClerkIdentity: true,
  };
}

export class MongoAccountDeletionStore implements AccountDeletionStore {
  private indexesReady?: Promise<unknown>;

  private async states(): Promise<Collection<AccountDeletionState>> {
    if (!mongoConfigured()) throw new Error("MONGODB_REQUIRED");
    const states = await collection<AccountDeletionState>(
      "accountDeletionStates",
    );
    this.indexesReady ??= states.createIndex(
      { subjectKey: 1 },
      { unique: true, name: "account_deletion_subject_unique" },
    );
    await this.indexesReady;
    return states;
  }

  async find(authUserId: string): Promise<AccountDeletionState | null> {
    return (await this.states()).findOne({ subjectKey: subjectKey(authUserId) });
  }

  async begin(input: {
    authUserId: string;
    operationId: string;
    context: RequestContext;
    pathnames: string[];
  }): Promise<AccountDeletionState> {
    const states = await this.states();
    const now = new Date();
    const key = subjectKey(input.authUserId);
    const created: AccountDeletionState = {
      id: randomUUID(),
      subjectKey: key,
      operationId: input.operationId,
      workspaceId: input.context.workspace.id,
      memberId: input.context.member.id,
      memberRole: input.context.member.role,
      pathnames: [...new Set(input.pathnames)].sort(),
      redactionId: randomUUID(),
      deletedWorkspace: input.context.member.role === "owner",
      billingSubscriptionCanceled: input.context.member.role === "reviewer",
      dataDeleted: false,
      billingCleaned: false,
      filesDeleted: false,
      complete: false,
      createdAt: now,
      updatedAt: now,
    };
    await states.updateOne(
      { subjectKey: key },
      { $setOnInsert: created },
      { upsert: true },
    );
    const state = await states.findOne({ subjectKey: key });
    if (!state) throw new Error("ACCOUNT_DELETION_STATE_MISSING");
    return state;
  }

  async targetExists(state: AccountDeletionState): Promise<boolean> {
    if (state.memberRole === "owner") {
      return Boolean(
        await (await collection("workspaces")).findOne(
          { id: state.workspaceId },
          { projection: { _id: 1 } },
        ),
      );
    }
    return Boolean(
      await (await collection("members")).findOne(
        { id: state.memberId, workspaceId: state.workspaceId },
        { projection: { _id: 1 } },
      ),
    );
  }

  async mark(
    state: AccountDeletionState,
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
  ): Promise<AccountDeletionState> {
    const updatedAt = new Date();
    const result = await (await this.states()).findOneAndUpdate(
      { id: state.id, subjectKey: state.subjectKey },
      {
        $set: {
          ...patch,
          ...(patch.complete ? { pathnames: [] } : {}),
          updatedAt,
        },
      },
      { returnDocument: "after" },
    );
    if (!result) throw new Error("ACCOUNT_DELETION_STATE_MISSING");
    return result;
  }
}
