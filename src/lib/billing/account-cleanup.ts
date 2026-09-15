import "server-only";

import { randomUUID } from "node:crypto";

import type { Collection, Document } from "mongodb";

import type {
  BillingLinkIntentDocument,
  GoogleExternalTransactionDocument,
} from "@/lib/billing/link-intents";
import { clerkConfigured } from "@/lib/auth/identity";
import { collection, mongoConfigured } from "@/lib/db/mongodb";

interface MoneyAmountLike {
  amount: number;
}

export interface ClerkBillingSubscriptionItemLike {
  id: string;
  status: string;
  amount?: MoneyAmountLike;
  nextPayment?: { amount: number | MoneyAmountLike } | null;
  plan: {
    isDefault: boolean;
    fee?: MoneyAmountLike | null;
    annualFee?: MoneyAmountLike | null;
    annualMonthlyFee?: MoneyAmountLike | null;
  } | null;
}

export interface ClerkBillingCancellationClient {
  getUserBillingSubscription(authUserId: string): Promise<{
    subscriptionItems: ClerkBillingSubscriptionItemLike[];
  }>;
  cancelSubscriptionItem(
    subscriptionItemId: string,
    options: { endNow: true },
  ): Promise<unknown>;
}

export interface BillingSubscriptionCancellationResult {
  canceledSubscriptionItemIds: string[];
}

function positiveAmount(value: number | MoneyAmountLike | null | undefined) {
  return (typeof value === "number" ? value : value?.amount ?? 0) > 0;
}

export function shouldCancelClerkBillingSubscriptionItem(
  item: ClerkBillingSubscriptionItemLike,
): boolean {
  if (["ended", "expired", "abandoned"].includes(item.status)) return false;
  if (item.plan?.isDefault === true) return false;

  return [
    item.amount,
    item.nextPayment?.amount,
    item.plan?.fee,
    item.plan?.annualFee,
    item.plan?.annualMonthlyFee,
  ].some(positiveAmount);
}

async function configuredClerkBillingClient(): Promise<
  ClerkBillingCancellationClient | undefined
> {
  if (!clerkConfigured()) return undefined;
  const { clerkClient } = await import("@clerk/nextjs/server");
  return (await clerkClient()).billing;
}

/**
 * Immediately ends paid Clerk subscription items before their local linkage is
 * redacted. Re-running this operation re-enumerates Clerk, so items ended by a
 * prior partial attempt are naturally skipped.
 */
export async function cancelClerkBillingForAuthUser(
  authUserId: string,
  options: { client?: ClerkBillingCancellationClient } = {},
): Promise<BillingSubscriptionCancellationResult> {
  const client = options.client ?? (await configuredClerkBillingClient());
  if (!client) return { canceledSubscriptionItemIds: [] };

  const subscription = await client.getUserBillingSubscription(authUserId);
  const items = subscription.subscriptionItems.filter(
    shouldCancelClerkBillingSubscriptionItem,
  );

  const canceledSubscriptionItemIds: string[] = [];
  for (const item of items) {
    await client.cancelSubscriptionItem(item.id, { endNow: true });
    canceledSubscriptionItemIds.push(item.id);
  }

  return { canceledSubscriptionItemIds };
}

export interface BillingDataCleanupResult {
  deletedLinkIntents: number;
  redactedGoogleTransactions: number;
  redactedWebhookReceipts: number;
}

export interface BillingDataCleanupStore {
  deleteLinkIntents(authUserId: string): Promise<number>;
  redactGoogleTransactions(
    authUserId: string,
    redactionId: string,
    now: Date,
  ): Promise<number>;
  redactWebhookReceipts(
    authUserId: string,
    redactionId: string,
    now: Date,
  ): Promise<number>;
}

/**
 * Removes short-lived checkout state while retaining de-identified webhook and
 * Google reporting rows needed for idempotency and external-transaction
 * compliance. The operation is safe to retry after a partial account deletion.
 */
export async function deleteBillingDataForAuthUser(
  authUserId: string,
  options: {
    store?: BillingDataCleanupStore;
    now?: Date;
    redactionId?: string;
  } = {},
): Promise<BillingDataCleanupResult> {
  const store = options.store ?? new MongoBillingDataCleanupStore();
  const now = options.now ?? new Date();
  const redactionId = options.redactionId ?? randomUUID();

  const [
    redactedGoogleTransactions,
    redactedWebhookReceipts,
    deletedLinkIntents,
  ] = await Promise.all([
    store.redactGoogleTransactions(authUserId, redactionId, now),
    store.redactWebhookReceipts(authUserId, redactionId, now),
    store.deleteLinkIntents(authUserId),
  ]);

  return {
    deletedLinkIntents,
    redactedGoogleTransactions,
    redactedWebhookReceipts,
  };
}

interface RedactableBillingDocument extends Document {
  authUserId?: string;
  payerUserId?: string;
  deletedSubjectId?: string;
  accountDeletedAt?: Date;
}

async function requiredCollection<T extends Document>(
  name: string,
): Promise<Collection<T>> {
  if (!mongoConfigured()) throw new Error("MONGODB_REQUIRED");
  return collection<T>(name);
}

export class MongoBillingDataCleanupStore implements BillingDataCleanupStore {
  async deleteLinkIntents(authUserId: string): Promise<number> {
    const result = await (
      await requiredCollection<BillingLinkIntentDocument>("billingLinkIntents")
    ).deleteMany({ authUserId });
    return result.deletedCount;
  }

  async redactGoogleTransactions(
    authUserId: string,
    redactionId: string,
    now: Date,
  ): Promise<number> {
    const result = await (
      await requiredCollection<GoogleExternalTransactionDocument>(
        "googleExternalTransactions",
      )
    ).updateMany(
      { authUserId },
      {
        $unset: { authUserId: "" },
        $set: { deletedSubjectId: redactionId, accountDeletedAt: now },
      },
    );
    return result.modifiedCount;
  }

  async redactWebhookReceipts(
    authUserId: string,
    redactionId: string,
    now: Date,
  ): Promise<number> {
    const result = await (
      await requiredCollection<RedactableBillingDocument>(
        "clerkBillingWebhookReceipts",
      )
    ).updateMany(
      { payerUserId: authUserId },
      {
        $unset: { payerUserId: "" },
        $set: { deletedSubjectId: redactionId, accountDeletedAt: now },
      },
    );
    return result.modifiedCount;
  }
}
