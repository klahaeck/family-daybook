import "server-only";

import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import type { Collection, Document } from "mongodb";
import { MongoServerError } from "mongodb";

import {
  MongoBillingLinkIntentStore,
  type BillingCompletionDetails,
  type BillingLinkIntentStore,
} from "@/lib/billing/link-intents";
import {
  allowedBillingPlanSlugs,
  hasAllowedBillingPlan,
} from "@/lib/auth/billing";
import { collection, mongoConfigured } from "@/lib/db/mongodb";

const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const RECEIPT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

type BillingWebhookEvent = Extract<
  WebhookEvent,
  {
    type:
      | `paymentAttempt.${string}`
      | `subscription.${string}`
      | `subscriptionItem.${string}`;
  }
>;

export interface BillingWebhookSummary {
  eventId: string;
  eventType: BillingWebhookEvent["type"];
  objectId: string;
  payerUserId?: string;
  status?: string;
  subscriptionItemIds: string[];
  amount?: number;
  currency?: string;
  completesCheckout: boolean;
}

interface ClerkBillingWebhookReceiptDocument extends Document {
  eventId: string;
  eventType: string;
  objectId: string;
  payerUserId?: string;
  status?: string;
  subscriptionItemIds: string[];
  processingStatus: "processing" | "completed" | "failed";
  attempts: number;
  leaseUntil: Date;
  receivedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  purgeAt: Date;
}

export interface BillingWebhookReceiptStore {
  claim(summary: BillingWebhookSummary, now: Date): Promise<boolean>;
  complete(eventId: string, now: Date): Promise<void>;
  fail(eventId: string, now: Date): Promise<void>;
}

export interface ProcessBillingWebhookResult {
  accepted: boolean;
  duplicate: boolean;
  linkedIntent: boolean;
}

interface ClerkBillingSubscriptionLookupClient {
  getUserBillingSubscription(authUserId: string): Promise<{
    subscriptionItems: Array<{
      id: string;
      status: string;
      periodEnd: number | null;
      plan: { slug: string; isDefault: boolean } | null;
    }>;
  }>;
}

export interface BillingCheckoutVerificationInput {
  payerUserId: string;
  subscriptionItemIds: string[];
  now: Date;
}

export type BillingCheckoutVerifier = (
  input: BillingCheckoutVerificationInput,
) => Promise<boolean>;

export async function verifyClerkPaidCheckout(
  input: BillingCheckoutVerificationInput,
  options: { client?: ClerkBillingSubscriptionLookupClient } = {},
): Promise<boolean> {
  if (input.subscriptionItemIds.length === 0) return false;

  let client = options.client;
  if (!client) {
    const { clerkClient } = await import("@clerk/nextjs/server");
    client = (await clerkClient()).billing;
  }

  const subscription = await client.getUserBillingSubscription(
    input.payerUserId,
  );
  const eventItemIds = new Set(input.subscriptionItemIds);
  const matchingItems = subscription.subscriptionItems.filter((item) =>
    eventItemIds.has(item.id),
  );

  return hasAllowedBillingPlan(
    matchingItems,
    allowedBillingPlanSlugs(),
    input.now.getTime(),
  );
}

function isBillingWebhookEvent(event: WebhookEvent): event is BillingWebhookEvent {
  return (
    event.type.startsWith("paymentAttempt.") ||
    event.type.startsWith("subscription.") ||
    event.type.startsWith("subscriptionItem.")
  );
}

export function summarizeBillingWebhook(
  eventId: string,
  event: WebhookEvent,
): BillingWebhookSummary | null {
  if (!isBillingWebhookEvent(event)) return null;

  if (event.type.startsWith("paymentAttempt.")) {
    const data = event.data as Extract<
      BillingWebhookEvent,
      { type: `paymentAttempt.${string}` }
    >["data"];
    return {
      eventId,
      eventType: event.type,
      objectId: data.id,
      ...(data.payer.user_id ? { payerUserId: data.payer.user_id } : {}),
      status: data.status,
      subscriptionItemIds: data.subscription_items.map((item) => item.id),
      amount: data.totals.grand_total.amount,
      currency: data.totals.grand_total.currency,
      completesCheckout:
        data.charge_type === "checkout" &&
        data.status === "paid" &&
        data.totals.grand_total.amount > 0,
    };
  }

  if (event.type.startsWith("subscriptionItem.")) {
    const data = event.data as Extract<
      BillingWebhookEvent,
      { type: `subscriptionItem.${string}` }
    >["data"];
    return {
      eventId,
      eventType: event.type,
      objectId: data.id,
      ...(data.payer?.user_id ? { payerUserId: data.payer.user_id } : {}),
      status: data.status,
      subscriptionItemIds: [data.id],
      amount: data.amount.amount,
      currency: data.amount.currency,
      completesCheckout: false,
    };
  }

  const data = event.data as Extract<
    BillingWebhookEvent,
    { type: `subscription.${string}` }
  >["data"];
  return {
    eventId,
    eventType: event.type,
    objectId: data.id,
    ...(data.payer.user_id ? { payerUserId: data.payer.user_id } : {}),
    status: data.status,
    subscriptionItemIds: data.items.map((item) => item.id),
    ...(data.items[0]
      ? {
          amount: data.items[0].amount.amount,
          currency: data.items[0].amount.currency,
        }
      : {}),
    completesCheckout: false,
  };
}

export async function processClerkBillingWebhook(
  eventId: string,
  event: WebhookEvent,
  options: {
    receiptStore?: BillingWebhookReceiptStore;
    intentStore?: BillingLinkIntentStore;
    verifyPaidCheckout?: BillingCheckoutVerifier;
    now?: Date;
  } = {},
): Promise<ProcessBillingWebhookResult> {
  const summary = summarizeBillingWebhook(eventId, event);
  if (!summary) {
    return { accepted: false, duplicate: false, linkedIntent: false };
  }

  const now = options.now ?? new Date();
  const receiptStore = options.receiptStore ?? new MongoBillingWebhookReceiptStore();
  const claimed = await receiptStore.claim(summary, now);
  if (!claimed) {
    return { accepted: true, duplicate: true, linkedIntent: false };
  }

  try {
    let linkedIntent = false;
    if (summary.completesCheckout && summary.payerUserId) {
      const verified = await (
        options.verifyPaidCheckout ?? verifyClerkPaidCheckout
      )({
        payerUserId: summary.payerUserId,
        subscriptionItemIds: summary.subscriptionItemIds,
        now,
      });
      if (verified) {
        const completion: BillingCompletionDetails = {
          eventId,
          subscriptionItemIds: summary.subscriptionItemIds,
          ...(summary.amount === undefined ? {} : { amount: summary.amount }),
          ...(summary.currency ? { currency: summary.currency } : {}),
        };
        linkedIntent = Boolean(
          await (
            options.intentStore ?? new MongoBillingLinkIntentStore()
          ).markCompletedForUser(summary.payerUserId, completion, now),
        );
      }
    }
    await receiptStore.complete(eventId, now);
    return { accepted: true, duplicate: false, linkedIntent };
  } catch (error) {
    await receiptStore.fail(eventId, now);
    throw error;
  }
}

let receiptsIndexesPromise: Promise<void> | undefined;

async function receiptsCollection(): Promise<
  Collection<ClerkBillingWebhookReceiptDocument>
> {
  if (!mongoConfigured()) throw new Error("MONGODB_REQUIRED");
  const result = await collection<ClerkBillingWebhookReceiptDocument>(
    "clerkBillingWebhookReceipts",
  );
  receiptsIndexesPromise ??= Promise.all([
    result.createIndex(
      { eventId: 1 },
      { unique: true, name: "clerk_billing_event_unique" },
    ),
    result.createIndex(
      { purgeAt: 1 },
      { expireAfterSeconds: 0, name: "clerk_billing_event_ttl" },
    ),
  ])
    .then(() => undefined)
    .catch((error) => {
      receiptsIndexesPromise = undefined;
      throw error;
    });
  await receiptsIndexesPromise;
  return result;
}

export class MongoBillingWebhookReceiptStore
  implements BillingWebhookReceiptStore
{
  async claim(summary: BillingWebhookSummary, now: Date): Promise<boolean> {
    const receipts = await receiptsCollection();
    try {
      const result = await receipts.findOneAndUpdate(
        {
          eventId: summary.eventId,
          $or: [
            { processingStatus: { $exists: false } },
            { processingStatus: "failed" },
            { processingStatus: "processing", leaseUntil: { $lte: now } },
          ],
        },
        {
          $setOnInsert: {
            eventId: summary.eventId,
            eventType: summary.eventType,
            objectId: summary.objectId,
            ...(summary.payerUserId
              ? { payerUserId: summary.payerUserId }
              : {}),
            ...(summary.status ? { status: summary.status } : {}),
            subscriptionItemIds: summary.subscriptionItemIds,
            receivedAt: now,
            purgeAt: new Date(now.getTime() + RECEIPT_RETENTION_MS),
          },
          $set: {
            processingStatus: "processing",
            leaseUntil: new Date(now.getTime() + PROCESSING_LEASE_MS),
            updatedAt: now,
          },
          $inc: { attempts: 1 },
          $unset: { failedAt: "" },
        },
        { upsert: true, returnDocument: "after" },
      );
      return Boolean(result);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) return false;
      throw error;
    }
  }

  async complete(eventId: string, now: Date): Promise<void> {
    await (await receiptsCollection()).updateOne(
      { eventId, processingStatus: "processing" },
      {
        $set: {
          processingStatus: "completed",
          completedAt: now,
          updatedAt: now,
        },
        $unset: { leaseUntil: "", failedAt: "" },
      },
    );
  }

  async fail(eventId: string, now: Date): Promise<void> {
    await (await receiptsCollection()).updateOne(
      { eventId, processingStatus: "processing" },
      {
        $set: {
          processingStatus: "failed",
          failedAt: now,
          updatedAt: now,
        },
        $unset: { leaseUntil: "" },
      },
    );
  }
}
