import "server-only";

import type { AuthInfo, ServerContext } from "@modelcontextprotocol/server";
import {
  bearerAuthChallengeResponse,
  OAuthError,
  OAuthErrorCode,
} from "@modelcontextprotocol/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { clerkClient } from "@clerk/nextjs/server";
import { createMcpHandler, getPublicOrigin, withMcpAuth } from "mcp-handler";
import { z } from "zod";

import {
  createDaybookService,
  daybookCreateCareEntrySchema,
  DaybookServiceError,
} from "@/lib/application/daybook-service";
import { getIdentityForAuthUserId, clerkConfigured } from "@/lib/auth/identity";
import {
  isBillingAccessUnavailableError,
} from "@/lib/auth/billing";
import { mongoConfigured } from "@/lib/db/mongodb";
import { canonicalJson, sha256 } from "@/lib/domain/integrity";
import {
  careEntryCorrectionSchema,
  careEntryUpdateSchema,
  dailyLogNotesSchema,
} from "@/lib/domain/schemas";
import { getRepository, getRequestContextForIdentity } from "@/lib/repository";
import type { RequestContext } from "@/lib/repository/repository";

export const DAYBOOK_SCOPES = {
  read: "daybook:read",
  write: "daybook:write",
  finalize: "daybook:finalize",
} as const;

export const TOOL_SCOPES: Record<string, string> = {
  get_daybook_context: DAYBOOK_SCOPES.read,
  get_day: DAYBOOK_SCOPES.read,
  get_care_entry: DAYBOOK_SCOPES.read,
  create_care_entry: DAYBOOK_SCOPES.write,
  update_care_entry: DAYBOOK_SCOPES.write,
  update_day_notes: DAYBOOK_SCOPES.write,
  preview_care_entry_correction: DAYBOOK_SCOPES.write,
  confirm_care_entry_correction: DAYBOOK_SCOPES.write,
  preview_day_finalization: DAYBOOK_SCOPES.finalize,
  confirm_day_finalization: DAYBOOK_SCOPES.finalize,
};

const mutationId = z.string().uuid();
const version = z.string().length(64);
const handle = z.string().min(32).max(200);
const outputSchema = z.object({
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    })
    .optional(),
});

type ToolContext = ServerContext;

function stableError(error: unknown) {
  const rawCode = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const supported = new Set([
    "VALIDATION_ERROR",
    "NOT_FOUND",
    "FORBIDDEN",
    "DAY_FINALIZED",
    "DAY_NOT_FINALIZED",
    "VERSION_CONFLICT",
    "CONFIRMATION_EXPIRED",
    "CONFIRMATION_STALE",
    "IDEMPOTENCY_CONFLICT",
  ]);
  const code = supported.has(rawCode)
    ? rawCode
    : rawCode === "SUBSCRIPTION_REQUIRED" ||
        rawCode === "BILLING_ACCESS_UNAVAILABLE" ||
        rawCode === "BILLING_OWNER_REQUIRED"
      ? "FORBIDDEN"
      : rawCode.startsWith("INVALID_")
        ? "VALIDATION_ERROR"
        : "INTERNAL_ERROR";
  const messages: Record<string, string> = {
    VALIDATION_ERROR: "The supplied input is invalid.",
    NOT_FOUND: "The requested day or record was not found.",
    FORBIDDEN: "The authorized user cannot perform this operation.",
    DAY_FINALIZED: "The day is finalized; use the correction flow.",
    DAY_NOT_FINALIZED: "The day is open; update the record directly.",
    VERSION_CONFLICT: "The record or day changed; fetch it again and retry.",
    CONFIRMATION_EXPIRED: "The confirmation is missing, expired, or already used.",
    CONFIRMATION_STALE: "The confirmed data changed; request a new preview.",
    IDEMPOTENCY_CONFLICT: "The operation ID was already used for different input.",
    INTERNAL_ERROR: "The operation could not be completed.",
  };
  return {
    code,
    message: messages[code],
    ...(error instanceof DaybookServiceError && error.fieldErrors
      ? { fieldErrors: error.fieldErrors }
      : {}),
  };
}

function success(data: unknown, summary: string) {
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: { data },
  };
}

function failure(error: unknown) {
  const mapped = stableError(error);
  return {
    isError: true,
    content: [
      { type: "text" as const, text: `${mapped.code}: ${mapped.message}` },
    ],
    structuredContent: { error: mapped },
  };
}

async function serviceFor(
  ctx: ToolContext,
  toolName: string,
  input: Record<string, unknown>,
) {
  const authInfo = ctx.http?.authInfo;
  const userId = (authInfo?.extra as { userId?: unknown } | undefined)?.userId;
  if (
    typeof userId !== "string" ||
    !authInfo?.clientId ||
    !authInfo.scopes.includes(TOOL_SCOPES[toolName])
  ) {
    throw new Error("FORBIDDEN");
  }
  const authorizedContext = (
    authInfo.extra as { daybookContext?: RequestContext } | undefined
  )?.daybookContext;
  const operationId =
    typeof input.operationId === "string" ? input.operationId : undefined;
  const baseContext =
    authorizedContext ??
    (await getRequestContextForIdentity(await getIdentityForAuthUserId(userId)));
  const context: RequestContext = {
    ...baseContext,
    agent: {
    source: "mcp",
    oauthClientId: authInfo.clientId,
    toolName,
    operationId,
    inputHash: operationId ? sha256(canonicalJson(input)) : undefined,
    expectedRecordVersion:
      typeof input.recordVersion === "string" ? input.recordVersion : undefined,
      expectedDayVersion:
        typeof input.dayVersion === "string" ? input.dayVersion : undefined,
    },
  };
  return createDaybookService(await getRepository(), context);
}

async function runTool<T>(work: () => Promise<T>, summary: (value: T) => string) {
  try {
    const data = await work();
    return success(data, summary(data));
  } catch (error) {
    return failure(error);
  }
}

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const confirmedAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const rawHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_daybook_context",
      {
        title: "Get Daybook Context",
        description:
          "Get the authorized member role, workspace timezone, local date, and active child/caregiver references.",
        inputSchema: z.object({}),
        outputSchema,
        annotations: readAnnotations,
      },
      async (input, ctx) =>
        runTool(
          async () => (await serviceFor(ctx, "get_daybook_context", input)).getContext(),
          () => "Returned the authorized Daybook context.",
        ),
    );

    server.registerTool(
      "get_day",
      {
        title: "Get Day",
        description:
          "Get a visible care day with tasks, entries, completion, and its concurrency version.",
        inputSchema: z.object({ localDate: z.string().date() }),
        outputSchema,
        annotations: readAnnotations,
      },
      async (input, ctx) =>
        runTool(
          async () => (await serviceFor(ctx, "get_day", input)).getDay(input.localDate),
          (day) => `Returned ${day.localDate} (${day.status}).`,
        ),
    );

    server.registerTool(
      "get_care_entry",
      {
        title: "Get Care Entry",
        description:
          "Get a visible care record, its current version, and revision history.",
        inputSchema: z.object({ recordId: z.string().min(1) }),
        outputSchema,
        annotations: readAnnotations,
      },
      async (input, ctx) =>
        runTool(
          async () =>
            (await serviceFor(ctx, "get_care_entry", input)).getCareEntry(
              input.recordId,
            ),
          (entry) => `Returned care entry ${entry.record.id}.`,
        ),
    );

    server.registerTool(
      "create_care_entry",
      {
        title: "Create Care Entry",
        description:
          "Create a routine, special-arrangement, or factual custom care entry.",
        inputSchema: daybookCreateCareEntrySchema.extend({ operationId: mutationId }),
        outputSchema,
        annotations: writeAnnotations,
      },
      async (input, ctx) =>
        runTool(
          async () => {
            const service = await serviceFor(ctx, "create_care_entry", input);
            return service.createCareEntry(input);
          },
          (entry) => `Created care entry ${entry.id}.`,
        ),
    );

    server.registerTool(
      "update_care_entry",
      {
        title: "Update Care Entry",
        description: "Update an existing record while its care day is open.",
        inputSchema: careEntryUpdateSchema.safeExtend({
          recordVersion: version,
          operationId: mutationId,
        }),
        outputSchema,
        annotations: writeAnnotations,
      },
      async (input, ctx) =>
        runTool(
          async () => {
            const service = await serviceFor(ctx, "update_care_entry", input);
            return service.updateCareEntry(input);
          },
          (entry) => `Updated care entry ${entry.id}.`,
        ),
    );

    server.registerTool(
      "update_day_notes",
      {
        title: "Update Day Notes",
        description: "Replace notes on an open care day.",
        inputSchema: dailyLogNotesSchema.extend({
          dayVersion: version,
          operationId: mutationId,
        }),
        outputSchema,
        annotations: writeAnnotations,
      },
      async (input, ctx) =>
        runTool(
          async () => {
            const service = await serviceFor(ctx, "update_day_notes", input);
            return service.updateDayNotes(input);
          },
          (log) => `Updated notes for ${log.localDate}.`,
        ),
    );

    server.registerTool(
      "preview_care_entry_correction",
      {
        title: "Preview Care Entry Correction",
        description:
          "Preview a correction to a finalized record and issue a five-minute confirmation handle.",
        inputSchema: careEntryCorrectionSchema.safeExtend({
          recordVersion: version,
          operationId: mutationId,
        }),
        outputSchema,
        annotations: writeAnnotations,
      },
      async (input, ctx) =>
        runTool(
          async () =>
            (
              await serviceFor(ctx, "preview_care_entry_correction", input)
            ).previewCareEntryCorrection(input),
          (preview) =>
            `Prepared a correction preview with ${preview.diff.length} changed field(s).`,
        ),
    );

    server.registerTool(
      "confirm_care_entry_correction",
      {
        title: "Confirm Care Entry Correction",
        description:
          "Consume a correction confirmation handle and append the unchanged proposed revision.",
        inputSchema: z.object({
          confirmationHandle: handle,
          operationId: mutationId,
        }),
        outputSchema,
        annotations: confirmedAnnotations,
      },
      async (input, ctx) =>
        runTool(
          async () =>
            (
              await serviceFor(ctx, "confirm_care_entry_correction", input)
            ).confirmCareEntryCorrection(input.confirmationHandle),
          (result) => `Appended correction revision ${result.revisionId}.`,
        ),
    );

    server.registerTool(
      "preview_day_finalization",
      {
        title: "Preview Day Finalization",
        description:
          "Return the exact open-day summary and a five-minute confirmation handle.",
        inputSchema: z.object({
          localDate: z.string().date(),
          dayVersion: version,
          operationId: mutationId,
        }),
        outputSchema,
        annotations: writeAnnotations,
      },
      async (input, ctx) =>
        runTool(
          async () =>
            (
              await serviceFor(ctx, "preview_day_finalization", input)
            ).previewDayFinalization(input.localDate, input.dayVersion),
          (preview) => `Prepared finalization preview for ${preview.localDate}.`,
        ),
    );

    server.registerTool(
      "confirm_day_finalization",
      {
        title: "Confirm Day Finalization",
        description:
          "Consume a finalization handle and finalize the exact unchanged day it represents.",
        inputSchema: z.object({
          confirmationHandle: handle,
          operationId: mutationId,
        }),
        outputSchema,
        annotations: confirmedAnnotations,
      },
      async (input, ctx) =>
        runTool(
          async () =>
            (
              await serviceFor(ctx, "confirm_day_finalization", input)
            ).confirmDayFinalization(input.confirmationHandle),
          (result) => `Finalized ${result.localDate}.`,
        ),
    );
  },
  {
    serverInfo: { name: "family-daybook", version: "1.0.0" },
    instructions:
      "Use get_daybook_context first. Never guess IDs. Fetch fresh versions before mutations. Corrections and finalization require preview followed by confirmation.",
    maxSubscriptions: 0,
  },
);

function unavailable() {
  return Response.json(
    { error: "MCP_UNAVAILABLE" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

async function requestedTool(request: Request): Promise<string | undefined> {
  const modernMethod = request.headers.get("Mcp-Method");
  if (modernMethod === "tools/call") return request.headers.get("Mcp-Name") ?? undefined;
  if (request.method !== "POST") return undefined;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined;
  try {
    const body = (await request.clone().json()) as {
      method?: unknown;
      params?: { name?: unknown };
    };
    return body.method === "tools/call" && typeof body.params?.name === "string"
      ? body.params.name
      : undefined;
  } catch {
    return undefined;
  }
}

export async function daybookScopeGate(request: Request) {
  const toolName = await requestedTool(request);
  const requiredScope = toolName ? TOOL_SCOPES[toolName] : undefined;
  if (requiredScope && !request.auth?.scopes.includes(requiredScope)) {
    const resourceMetadataUrl = `${getPublicOrigin(request)}/.well-known/oauth-protected-resource/mcp`;
    return bearerAuthChallengeResponse(
      new OAuthError(
        OAuthErrorCode.InsufficientScope,
        `The ${requiredScope} scope is required.`,
      ),
      { requiredScopes: [requiredScope], resourceMetadataUrl },
    );
  }
  return rawHandler(request);
}

async function authorizedScopeGate(request: Request) {
  const authInfo = request.auth;
  const userId = (authInfo?.extra as { userId?: unknown } | undefined)?.userId;
  if (typeof userId !== "string" || !authInfo?.clientId) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "The OAuth identity is invalid." } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const context = await getRequestContextForIdentity(
      await getIdentityForAuthUserId(userId),
    );
    request.auth = {
      ...authInfo,
      extra: { ...authInfo.extra, userId, daybookContext: context },
    };
  } catch (error) {
    const unavailable = isBillingAccessUnavailableError(error);
    return Response.json(
      {
        error: {
          code: unavailable ? "BILLING_ACCESS_UNAVAILABLE" : "FORBIDDEN",
          message: unavailable
            ? "Billing access could not be verified."
            : "The authorized user cannot access this workspace.",
        },
      },
      {
        status: unavailable ? 503 : 403,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  return daybookScopeGate(request);
}

const authenticatedHandler = withMcpAuth(
  authorizedScopeGate,
  async (request, token) => {
    const resourceUrl = `${getPublicOrigin(request)}/mcp`;
    const authState = await (await clerkClient()).authenticateRequest(request, {
      acceptsToken: "oauth_token",
      audience: resourceUrl,
    });
    const clerkAuth = authState.toAuth();
    return verifyClerkToken(clerkAuth, token) as AuthInfo | undefined;
  },
  {
    required: true,
    resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
  },
);

export async function daybookMcpHandler(request: Request) {
  if (!clerkConfigured() || !mongoConfigured()) return unavailable();
  return authenticatedHandler(request);
}
