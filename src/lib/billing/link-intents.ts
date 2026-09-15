import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";

import { MongoServerError, type Collection, type Document } from "mongodb";

import { collection, mongoConfigured } from "@/lib/db/mongodb";
import { getSiteUrl } from "@/lib/metadata/site-url";

const LINK_INTENT_TTL_MS = 10 * 60 * 1000;
const IOS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type BillingLinkPlatform = "ios" | "android";
export type BillingLinkIntentStatus =
  | "created"
  | "checkout_opened"
  | "completed"
  | "superseded";

export type GoogleExternalReportStatus =
  | "awaiting_clerk_event"
  | "pending"
  | "reported"
  | "failed";

export interface BillingLinkIntentDocument extends Document {
  id: string;
  tokenHash: string;
  authUserId: string;
  operationId?: string;
  requestHash?: string;
  platform: BillingLinkPlatform;
  status: BillingLinkIntentStatus;
  createdAt: Date;
  updatedAt: Date;
  checkoutExpiresAt: Date;
  purgeAt?: Date;
  checkoutOpenedAt?: Date;
  completedAt?: Date;
  clerkEventId?: string;
  clerkSubscriptionItemIds?: string[];
  googleExternal?: {
    encryptedTransactionToken: string;
    tokenCreatedAt: Date;
    reportStatus: GoogleExternalReportStatus;
  };
}

export interface GoogleExternalTransactionDocument extends Document {
  id: string;
  billingLinkIntentId: string;
  authUserId?: string;
  deletedSubjectId?: string;
  accountDeletedAt?: Date;
  packageName: string;
  externalTransactionId: string;
  encryptedTransactionToken: string;
  clerkSubscriptionItemIds: string[];
  reportType: "new_subscription";
  reportStatus: "pending" | "reported" | "failed";
  reportAttempts: number;
  amount?: number;
  currency?: string;
  createdAt: Date;
  updatedAt: Date;
  nextAttemptAt: Date;
  reportedAt?: Date;
  lastErrorCode?: string;
}

export interface CreatedBillingLinkIntent {
  id: string;
  token: string;
  checkoutUrl: string;
  completionUrl: string;
  expiresAt: string;
}

export interface BillingLinkIntentView {
  id: string;
  platform: BillingLinkPlatform;
  status: BillingLinkIntentStatus;
  checkoutExpiresAt: string;
  completedAt?: string;
}

export interface BillingCompletionDetails {
  eventId: string;
  subscriptionItemIds: string[];
  amount?: number;
  currency?: string;
}

interface BillingLinkEnvironment {
  [key: string]: string | undefined;
  GOOGLE_PLAY_EXTERNAL_CONTENT_LINKS_ENABLED?: string;
  GOOGLE_PLAY_EXTERNAL_TOKEN_ENCRYPTION_KEY?: string;
}

export class BillingLinkIntentError extends Error {
  constructor(
    public readonly code:
      | "BILLING_LINK_EXPIRED"
      | "BILLING_LINK_NOT_FOUND"
      | "GOOGLE_EXTERNAL_LINKS_UNAVAILABLE"
      | "INVALID_GOOGLE_TRANSACTION_TOKEN"
      | "IDEMPOTENCY_CONFLICT",
  ) {
    super(code);
    this.name = "BillingLinkIntentError";
  }
}

export interface BillingLinkIntentStore {
  create(intent: BillingLinkIntentDocument): Promise<void>;
  supersedeActiveForUser(
    authUserId: string,
    now: Date,
    exceptId?: string,
  ): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<BillingLinkIntentDocument | null>;
  findByOperation?(
    authUserId: string,
    operationId: string,
  ): Promise<BillingLinkIntentDocument | null>;
  markCheckoutOpened(id: string, now: Date): Promise<void>;
  markCompletedForUser(
    authUserId: string,
    details: BillingCompletionDetails,
    now: Date,
  ): Promise<BillingLinkIntentDocument | null>;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function requestHash(input: {
  platform: BillingLinkPlatform;
  googleExternalTransactionToken?: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        platform: input.platform,
        googleExternalTransactionToken:
          input.googleExternalTransactionToken ?? null,
      }),
      "utf8",
    )
    .digest("hex");
}

function idempotentIntentToken(
  authUserId: string,
  operationId: string,
  secret = process.env.CLERK_SECRET_KEY,
): string {
  if (!secret) throw new Error("API_AUTH_UNAVAILABLE");
  return createHmac("sha256", secret)
    .update(`${authUserId}\0${operationId}`, "utf8")
    .digest("base64url");
}

function googleExternalLinksEnabled(
  environment: BillingLinkEnvironment = process.env,
): boolean {
  return environment.GOOGLE_PLAY_EXTERNAL_CONTENT_LINKS_ENABLED === "true";
}

function googleEncryptionKey(environment: BillingLinkEnvironment): Buffer {
  const encoded = environment.GOOGLE_PLAY_EXTERNAL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    throw new BillingLinkIntentError("GOOGLE_EXTERNAL_LINKS_UNAVAILABLE");
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new BillingLinkIntentError("GOOGLE_EXTERNAL_LINKS_UNAVAILABLE");
  }
  return key;
}

export function encryptGoogleExternalTransactionToken(
  token: string,
  environment: BillingLinkEnvironment = process.env,
): string {
  if (token.length < 16 || token.length > 4096) {
    throw new BillingLinkIntentError("INVALID_GOOGLE_TRANSACTION_TOKEN");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", googleEncryptionKey(environment), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptGoogleExternalTransactionToken(
  encrypted: string,
  environment: BillingLinkEnvironment = process.env,
): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] =
    encrypted.split(".");
  if (
    version !== "v1" ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    extra.length > 0
  ) {
    throw new BillingLinkIntentError("INVALID_GOOGLE_TRANSACTION_TOKEN");
  }

  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      throw new Error("invalid envelope");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      googleEncryptionKey(environment),
      iv,
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (
      error instanceof BillingLinkIntentError &&
      error.code === "GOOGLE_EXTERNAL_LINKS_UNAVAILABLE"
    ) {
      throw error;
    }
    throw new BillingLinkIntentError("INVALID_GOOGLE_TRANSACTION_TOKEN");
  }
}

export function billingLinkUrls(token: string): {
  checkoutUrl: string;
  completionUrl: string;
} {
  const site = getSiteUrl();
  const checkoutUrl = new URL("/mobile/subscribe", site);
  const completionUrl = new URL("/mobile/complete", site);
  checkoutUrl.searchParams.set("intent", token);
  completionUrl.searchParams.set("intent", token);
  return {
    checkoutUrl: checkoutUrl.toString(),
    completionUrl: completionUrl.toString(),
  };
}

export async function createBillingLinkIntent(
  input: {
    authUserId: string;
    platform: BillingLinkPlatform;
    googleExternalTransactionToken?: string;
    operationId?: string;
  },
  options: {
    store?: BillingLinkIntentStore;
    now?: Date;
    environment?: BillingLinkEnvironment;
    idempotencySecret?: string;
  } = {},
): Promise<CreatedBillingLinkIntent> {
  const store = options.store ?? new MongoBillingLinkIntentStore();
  const now = options.now ?? new Date();
  const environment = options.environment ?? process.env;
  const inputRequestHash = requestHash(input);
  const existing = input.operationId
    ? await store.findByOperation?.(input.authUserId, input.operationId)
    : null;
  if (existing) {
    if (existing.requestHash !== inputRequestHash) {
      throw new BillingLinkIntentError("IDEMPOTENCY_CONFLICT");
    }
    const token = idempotentIntentToken(
      input.authUserId,
      input.operationId!,
      options.idempotencySecret,
    );
    return {
      id: existing.id,
      token,
      ...billingLinkUrls(token),
      expiresAt: existing.checkoutExpiresAt.toISOString(),
    };
  }
  const token = input.operationId
    ? idempotentIntentToken(
        input.authUserId,
        input.operationId,
        options.idempotencySecret,
      )
    : randomBytes(32).toString("base64url");
  const id = randomUUID();
  const checkoutExpiresAt = new Date(now.getTime() + LINK_INTENT_TTL_MS);

  let googleExternal: BillingLinkIntentDocument["googleExternal"];
  if (input.platform === "android") {
    if (!googleExternalLinksEnabled(environment)) {
      throw new BillingLinkIntentError("GOOGLE_EXTERNAL_LINKS_UNAVAILABLE");
    }
    if (!input.googleExternalTransactionToken) {
      throw new BillingLinkIntentError("INVALID_GOOGLE_TRANSACTION_TOKEN");
    }
    googleExternal = {
      encryptedTransactionToken: encryptGoogleExternalTransactionToken(
        input.googleExternalTransactionToken,
        environment,
      ),
      tokenCreatedAt: now,
      reportStatus: "awaiting_clerk_event",
    };
  } else if (input.googleExternalTransactionToken) {
    throw new BillingLinkIntentError("INVALID_GOOGLE_TRANSACTION_TOKEN");
  }

  const document: BillingLinkIntentDocument = {
    id,
    tokenHash: tokenHash(token),
    authUserId: input.authUserId,
    ...(input.operationId
      ? { operationId: input.operationId, requestHash: inputRequestHash }
      : {}),
    platform: input.platform,
    status: "created",
    createdAt: now,
    updatedAt: now,
    checkoutExpiresAt,
    purgeAt: checkoutExpiresAt,
    ...(googleExternal ? { googleExternal } : {}),
  };
  try {
    await store.create(document);
    await store.supersedeActiveForUser(input.authUserId, now, id);
  } catch (error) {
    if (
      input.operationId &&
      error instanceof MongoServerError &&
      error.code === 11000
    ) {
      const raced = await store.findByOperation?.(
        input.authUserId,
        input.operationId,
      );
      if (raced?.requestHash === inputRequestHash) {
        return {
          id: raced.id,
          token,
          ...billingLinkUrls(token),
          expiresAt: raced.checkoutExpiresAt.toISOString(),
        };
      }
      throw new BillingLinkIntentError("IDEMPOTENCY_CONFLICT");
    }
    throw error;
  }

  return {
    id,
    token,
    ...billingLinkUrls(token),
    expiresAt: checkoutExpiresAt.toISOString(),
  };
}

export async function getBillingLinkIntentForUser(
  token: string,
  authUserId: string,
  options: { store?: BillingLinkIntentStore; now?: Date } = {},
): Promise<BillingLinkIntentView> {
  const intent = await (options.store ?? new MongoBillingLinkIntentStore()).findByTokenHash(
    tokenHash(token),
  );
  if (!intent || intent.authUserId !== authUserId) {
    throw new BillingLinkIntentError("BILLING_LINK_NOT_FOUND");
  }

  const now = options.now ?? new Date();
  if (
    intent.status !== "completed" &&
    (intent.status === "superseded" || intent.checkoutExpiresAt <= now)
  ) {
    throw new BillingLinkIntentError("BILLING_LINK_EXPIRED");
  }

  return {
    id: intent.id,
    platform: intent.platform,
    status: intent.status,
    checkoutExpiresAt: intent.checkoutExpiresAt.toISOString(),
    ...(intent.completedAt
      ? { completedAt: intent.completedAt.toISOString() }
      : {}),
  };
}

export async function markBillingCheckoutOpened(
  token: string,
  authUserId: string,
  options: { store?: BillingLinkIntentStore; now?: Date } = {},
): Promise<BillingLinkIntentView> {
  const store = options.store ?? new MongoBillingLinkIntentStore();
  const view = await getBillingLinkIntentForUser(token, authUserId, {
    store,
    now: options.now,
  });
  if (view.status === "completed") return view;
  const now = options.now ?? new Date();
  await store.markCheckoutOpened(view.id, now);
  return { ...view, status: "checkout_opened" };
}

let indexesPromise: Promise<void> | undefined;
let googleIndexesPromise: Promise<void> | undefined;

async function billingLinkIntentsCollection(): Promise<
  Collection<BillingLinkIntentDocument>
> {
  if (!mongoConfigured()) throw new Error("MONGODB_REQUIRED");
  const result = await collection<BillingLinkIntentDocument>("billingLinkIntents");
  indexesPromise ??= Promise.all([
    result.createIndex(
      { tokenHash: 1 },
      { unique: true, name: "billing_link_token_unique" },
    ),
    result.createIndex(
      { authUserId: 1, status: 1, checkoutExpiresAt: -1 },
      { name: "billing_link_user_status" },
    ),
    result.createIndex(
      { authUserId: 1, operationId: 1 },
      { unique: true, sparse: true, name: "billing_link_operation_unique" },
    ),
    result.createIndex(
      { purgeAt: 1 },
      { expireAfterSeconds: 0, name: "billing_link_ttl" },
    ),
  ])
    .then(() => undefined)
    .catch((error) => {
      indexesPromise = undefined;
      throw error;
    });
  await indexesPromise;
  return result;
}

async function googleExternalTransactionsCollection(): Promise<
  Collection<GoogleExternalTransactionDocument>
> {
  if (!mongoConfigured()) throw new Error("MONGODB_REQUIRED");
  const result = await collection<GoogleExternalTransactionDocument>(
    "googleExternalTransactions",
  );
  googleIndexesPromise ??= Promise.all([
    result.createIndex(
      { billingLinkIntentId: 1 },
      { unique: true, name: "google_external_intent_unique" },
    ),
    result.createIndex(
      { reportStatus: 1, nextAttemptAt: 1 },
      { name: "google_external_report_queue" },
    ),
    result.createIndex(
      { clerkSubscriptionItemIds: 1 },
      { name: "google_external_subscription_item" },
    ),
  ])
    .then(() => undefined)
    .catch((error) => {
      googleIndexesPromise = undefined;
      throw error;
    });
  await googleIndexesPromise;
  return result;
}

export class MongoBillingLinkIntentStore implements BillingLinkIntentStore {
  async create(intent: BillingLinkIntentDocument): Promise<void> {
    await (await billingLinkIntentsCollection()).insertOne(intent);
  }

  async supersedeActiveForUser(
    authUserId: string,
    now: Date,
    exceptId?: string,
  ): Promise<void> {
    await (await billingLinkIntentsCollection()).updateMany(
      {
        authUserId,
        ...(exceptId ? { id: { $ne: exceptId } } : {}),
        status: { $in: ["created", "checkout_opened"] },
      },
      {
        $set: {
          status: "superseded",
          updatedAt: now,
          purgeAt: now,
        },
      },
    );
  }

  async findByTokenHash(value: string): Promise<BillingLinkIntentDocument | null> {
    return (await billingLinkIntentsCollection()).findOne({ tokenHash: value });
  }

  async findByOperation(
    authUserId: string,
    operationId: string,
  ): Promise<BillingLinkIntentDocument | null> {
    return (await billingLinkIntentsCollection()).findOne({
      authUserId,
      operationId,
    });
  }

  async markCheckoutOpened(id: string, now: Date): Promise<void> {
    await (await billingLinkIntentsCollection()).updateOne(
      { id, status: { $in: ["created", "checkout_opened"] } },
      {
        $set: {
          status: "checkout_opened",
          checkoutOpenedAt: now,
          updatedAt: now,
        },
      },
    );
  }

  async markCompletedForUser(
    authUserId: string,
    details: BillingCompletionDetails,
    now: Date,
  ): Promise<BillingLinkIntentDocument | null> {
    const intents = await billingLinkIntentsCollection();
    const intent = await intents.findOne(
      {
        authUserId,
        // A paid event may only attach to an intent whose authenticated
        // checkout page was actually opened. Merely creating a mobile link is
        // not enough to associate an unrelated web purchase with Android's
        // external-transaction reporting token.
        status: "checkout_opened",
        checkoutExpiresAt: { $gt: now },
      },
      { sort: { createdAt: -1 } },
    );
    if (!intent) return null;

    if (intent.platform === "android" && intent.googleExternal) {
      const reports = await googleExternalTransactionsCollection();
      await reports.updateOne(
        { billingLinkIntentId: intent.id },
        {
          $setOnInsert: {
            id: randomUUID(),
            billingLinkIntentId: intent.id,
            authUserId,
            packageName: "com.myfamilydaybook.app",
            externalTransactionId: `fd_${intent.id}`,
            encryptedTransactionToken:
              intent.googleExternal.encryptedTransactionToken,
            clerkSubscriptionItemIds: details.subscriptionItemIds,
            reportType: "new_subscription",
            reportStatus: "pending",
            reportAttempts: 0,
            createdAt: now,
            updatedAt: now,
            nextAttemptAt: now,
            ...(details.amount === undefined ? {} : { amount: details.amount }),
            ...(details.currency ? { currency: details.currency } : {}),
          },
        },
        { upsert: true },
      );
    }

    await intents.updateOne(
      { id: intent.id, status: { $ne: "completed" } },
      {
        $set: {
          status: "completed",
          completedAt: now,
          updatedAt: now,
          clerkEventId: details.eventId,
          clerkSubscriptionItemIds: details.subscriptionItemIds,
          ...(intent.platform === "android" && intent.googleExternal
            ? {
                "googleExternal.reportStatus": "pending",
              }
            : {}),
          ...(intent.platform === "ios"
            ? { purgeAt: new Date(now.getTime() + IOS_RETENTION_MS) }
            : {}),
        },
        ...(intent.platform === "android" ? { $unset: { purgeAt: "" } } : {}),
      },
    );

    return { ...intent, status: "completed", completedAt: now, updatedAt: now };
  }
}
