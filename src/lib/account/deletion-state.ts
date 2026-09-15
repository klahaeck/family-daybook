import "server-only";

import { createHash } from "node:crypto";

import type { ClientSession, Document } from "mongodb";

import { collection, mongoConfigured } from "@/lib/db/mongodb";

interface AccountSubjectFence extends Document {
  subjectKey: string;
  state: "active" | "deleting";
  workspaceId: string;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkspaceMutationFence extends Document {
  workspaceId: string;
  state: "active" | "deleting";
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
}

function accountDeletionSubjectKey(authUserId: string): string {
  return createHash("sha256").update(authUserId, "utf8").digest("hex");
}

function duplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

async function subjectFences() {
  return collection<AccountSubjectFence>("accountSubjectFences");
}

async function workspaceFences() {
  return collection<WorkspaceMutationFence>("workspaceMutationFences");
}

async function claimAccountSubject(
  authUserId: string,
  workspaceId: string,
  session: ClientSession,
): Promise<void> {
  const subjectKey = accountDeletionSubjectKey(authUserId);
  const receipt = await (await collection("accountDeletionStates")).findOne(
    { subjectKey },
    { projection: { _id: 1 }, session },
  );
  if (receipt) throw new Error("ACCOUNT_DELETION_IN_PROGRESS");

  const now = new Date();
  try {
    const result = await (await subjectFences()).updateOne(
      { subjectKey, workspaceId, state: { $ne: "deleting" } },
      {
        $setOnInsert: {
          subjectKey,
          state: "active",
          workspaceId,
          createdAt: now,
        },
        $set: { updatedAt: now },
        $inc: { sequence: 1 },
      },
      { upsert: true, session },
    );
    if (!result.matchedCount && !result.upsertedCount) {
      throw new Error("ACCOUNT_DELETION_IN_PROGRESS");
    }
  } catch (error) {
    if (duplicateKey(error)) {
      throw new Error("ACCOUNT_DELETION_IN_PROGRESS");
    }
    throw error;
  }
}

/**
 * Account deletion receipts live outside a workspace so they survive removing
 * that workspace. Any receipt blocks automatic workspace bootstrap until the
 * Clerk identity is deleted. The hashed receipt deliberately outlives workspace
 * data so the same still-active identity cannot recreate it.
 */
export async function accountDeletionStarted(
  authUserId: string,
): Promise<boolean> {
  if (!mongoConfigured()) return false;
  const subjectKey = accountDeletionSubjectKey(authUserId);
  const [fence, receipt] = await Promise.all([
    (await subjectFences()).findOne(
      { subjectKey, state: "deleting" },
      { projection: { _id: 1 } },
    ),
    (await collection("accountDeletionStates")).findOne(
      { subjectKey },
      { projection: { _id: 1 } },
    ),
  ]);
  return Boolean(fence || receipt);
}

/**
 * Claims the auth subject and workspace in the same transaction that creates a
 * new workspace. Deletion flips this same subject document, so bootstrap and
 * deletion cannot both commit from stale snapshots.
 */
export async function claimAccountBootstrap(
  authUserId: string,
  workspaceId: string,
  session: ClientSession,
): Promise<boolean> {
  try {
    await claimAccountSubject(authUserId, workspaceId, session);
    await claimWorkspaceMutation(workspaceId, session);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ACCOUNT_DELETION_IN_PROGRESS"
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Claims both the authenticated subject and its workspace. Reviewer deletion
 * fences only the subject, while owner deletion also fences the workspace, so
 * every identity-scoped write must touch both documents to serialize safely
 * with either kind of deletion.
 */
export async function claimAccountMutation(
  authUserId: string,
  workspaceId: string,
  session: ClientSession,
): Promise<void> {
  await claimAccountSubject(authUserId, workspaceId, session);
  await claimWorkspaceMutation(workspaceId, session);
}

/**
 * Every Mongo workspace write claims this document in the same transaction as
 * its data changes. Account deletion flips the document to `deleting`, making
 * new writes fail and forcing already-running transactions to serialize before
 * or after deletion.
 */
export async function claimWorkspaceMutation(
  workspaceId: string,
  session: ClientSession,
): Promise<void> {
  const now = new Date();
  try {
    const result = await (await workspaceFences()).updateOne(
      { workspaceId, state: { $ne: "deleting" } },
      {
        $setOnInsert: {
          workspaceId,
          state: "active",
          createdAt: now,
        },
        $set: { updatedAt: now },
        $inc: { sequence: 1 },
      },
      { upsert: true, session },
    );
    if (!result.matchedCount && !result.upsertedCount) {
      throw new Error("ACCOUNT_DELETION_IN_PROGRESS");
    }
  } catch (error) {
    if (duplicateKey(error)) {
      throw new Error("ACCOUNT_DELETION_IN_PROGRESS");
    }
    throw error;
  }
}

/**
 * Starts deletion by atomically fencing both the auth subject and, for an
 * owner, the whole workspace. Once this commits, no new workspace transaction
 * can claim the active mutation fence.
 */
export async function beginAccountDeletionFence(
  authUserId: string,
  workspaceId: string,
  deleteWorkspace: boolean,
  session: ClientSession,
): Promise<void> {
  const now = new Date();
  await (await subjectFences()).updateOne(
    { subjectKey: accountDeletionSubjectKey(authUserId) },
    {
      $set: {
        state: "deleting",
        workspaceId,
        updatedAt: now,
      },
      $setOnInsert: {
        subjectKey: accountDeletionSubjectKey(authUserId),
        createdAt: now,
      },
      $inc: { sequence: 1 },
    },
    { upsert: true, session },
  );

  if (!deleteWorkspace) return;
  await (await workspaceFences()).updateOne(
    { workspaceId },
    {
      $set: { state: "deleting", updatedAt: now },
      $setOnInsert: { workspaceId, createdAt: now },
      $inc: { sequence: 1 },
    },
    { upsert: true, session },
  );
}
