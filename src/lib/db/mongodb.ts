import "server-only";

import {
  MongoClient,
  ServerApiVersion,
  type Collection,
  type Document,
} from "mongodb";

declare global {
  var __parentingMongoClientPromise: Promise<MongoClient> | undefined;
}

export function mongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

function createClient(): MongoClient {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  return new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    maxPoolSize: 10,
    minPoolSize: 0,
  });
}

export async function getMongoClient(): Promise<MongoClient> {
  globalThis.__parentingMongoClientPromise ??= createClient().connect();
  return globalThis.__parentingMongoClientPromise;
}

export async function getDatabase() {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB ?? "dev");
}

export async function collection<T extends Document>(
  name: string,
): Promise<Collection<T>> {
  return (await getDatabase()).collection<T>(name);
}

export async function ensureMongoIndexes(): Promise<void> {
  const db = await getDatabase();
  await Promise.all([
    db.collection("workspaces").createIndex(
      { id: 1 },
      { unique: true, name: "workspace_id_unique" },
    ),
    db.collection("members").createIndex(
      { id: 1 },
      { unique: true, name: "member_id_unique" },
    ),
    db.collection("members").createIndex(
      { workspaceId: 1, email: 1 },
      { unique: true, name: "workspace_email_unique" },
    ),
    db.collection("members").createIndex({ authUserId: 1 }, { sparse: true }),
    db.collection("careEntries").createIndex({ workspaceId: 1, occurredAt: -1 }),
    db.collection("careEntries").createIndex({ workspaceId: 1, dailyLogId: 1 }),
    db.collection("appointments").createIndex({ workspaceId: 1, scheduledAt: -1 }),
    db.collection("incidents").createIndex({ workspaceId: 1, occurredAt: -1 }),
    db.collection("recordRevisions").createIndex(
      { workspaceId: 1, recordType: 1, recordId: 1, revisionNumber: 1 },
      { unique: true },
    ),
    db.collection("attachments").createIndex({ workspaceId: 1, recordId: 1 }),
    db.collection("attachments").createIndex(
      { id: 1 },
      { unique: true, name: "attachment_id_unique" },
    ),
    db.collection("attachments").createIndex(
      { pathname: 1 },
      { unique: true, name: "attachment_pathname_unique" },
    ),
    db.collection("auditEvents").createIndex({ workspaceId: 1, occurredAt: 1 }),
    db.collection("reportSnapshots").createIndex({ workspaceId: 1, createdAt: -1 }),
    db.collection("dailyLogs").createIndex(
      { workspaceId: 1, localDate: 1 },
      { unique: true },
    ),
    db.collection("specialArrangementDays").createIndex(
      { workspaceId: 1, localDate: 1 },
      { unique: true, name: "special_arrangement_workspace_date_unique" },
    ),
    db
      .collection("specialArrangementDays")
      .createIndex({ workspaceId: 1, seriesId: 1, localDate: 1 }),
    db.collection("agentOperations").createIndex(
      { workspaceId: 1, memberId: 1, oauthClientId: 1, operationId: 1 },
      { unique: true, name: "agent_operation_unique" },
    ),
    db.collection("agentOperations").createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "agent_operation_ttl" },
    ),
    db.collection("agentConfirmations").createIndex(
      { tokenHash: 1 },
      { unique: true, name: "agent_confirmation_token_unique" },
    ),
    db.collection("agentConfirmations").createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "agent_confirmation_ttl" },
    ),
  ]);
}
