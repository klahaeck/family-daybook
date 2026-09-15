import "server-only";

import { randomBytes } from "node:crypto";

import type {
  AuthInfo,
  ElicitRequestFormParams,
  ServerContext,
} from "@modelcontextprotocol/server";
import {
  acceptedContent,
  bearerAuthChallengeResponse,
  CLIENT_CAPABILITIES_META_KEY,
  createRequestStateCodec,
  inputRequired,
  inputResponse,
  OAuthError,
  OAuthErrorCode,
} from "@modelcontextprotocol/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { clerkClient } from "@clerk/nextjs/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";

import {
  createDaybookService,
  daybookCreateCareEntrySchema,
  DaybookServiceError,
} from "@/lib/application/daybook-service";
import {
  createdRoutineResult,
  existingRoutineResult,
  planRoutineRecording,
  recordRoutineItemInputSchema,
  routineQuestionJsonSchema,
  routineQuestionSchema,
  type RecordRoutineItemInput,
  type RoutineWorkflowState,
  workflowStateFor,
} from "@/lib/application/routine-recording";
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
import {
  getDaybookTool,
  isDaybookToolName,
  TOOL_SCOPES,
  type DaybookToolName,
} from "@/lib/mcp/catalog";
import { getSiteUrl } from "@/lib/metadata/site-url";
import { getRepository, getRequestContextForIdentity } from "@/lib/repository";
import type { RequestContext } from "@/lib/repository/repository";

export { DAYBOOK_SCOPES, TOOL_SCOPES } from "@/lib/mcp/catalog";

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
const routineQuestionOutputSchema = z.object({
  field: z.enum([
    "localDate",
    "routineId",
    "status",
    "childIds",
    "caregiverIds",
    "localTime",
  ]),
  title: z.string(),
  prompt: z.string(),
  type: z.enum(["date", "time", "single_select", "multi_select"]),
  choices: z
    .array(z.object({ value: z.string(), title: z.string() }))
    .optional(),
});
const routineOutputSchema = z.object({
  data: z
    .discriminatedUnion("result", [
      z.object({
        result: z.literal("needs_input"),
        questions: z.array(routineQuestionOutputSchema),
        resolvedContext: z.object({
          timezone: z.string(),
          localDate: z.string().optional(),
          routine: z
            .object({
              id: z.string(),
              name: z.string(),
              scheduledTime: z.string(),
            })
            .optional(),
        }),
        continuationToken: z.string(),
        expiresAt: z.string().datetime(),
      }),
      z.object({
        result: z.literal("created"),
        record: z.unknown(),
        recordVersion: version,
      }),
      z.object({
        result: z.literal("already_recorded"),
        record: z.unknown(),
        recordVersion: version,
      }),
      z.object({ result: z.literal("cancelled") }),
    ])
    .optional(),
  error: outputSchema.shape.error,
});

type ToolContext = ServerContext;

const ephemeralRoutineStateKey = randomBytes(32).toString("hex");
const routineStateCodec = createRequestStateCodec<RoutineWorkflowState>({
  key: sha256(
    `family-daybook:record-routine-item:${process.env.CLERK_SECRET_KEY ?? ephemeralRoutineStateKey}`,
  ),
  ttlSeconds: 5 * 60,
  bind: (ctx) => {
    const authInfo = ctx.http?.authInfo;
    const extra = authInfo?.extra as
      | { userId?: unknown; daybookContext?: RequestContext }
      | undefined;
    return [
      "record_routine_item",
      typeof extra?.userId === "string" ? extra.userId : "",
      authInfo?.clientId ?? "",
      extra?.daybookContext?.workspace.id ?? "",
      extra?.daybookContext?.member.id ?? "",
    ].join("\0");
  },
});

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
    "ROUTINE_UNAVAILABLE",
    "WORKFLOW_EXPIRED",
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
    ROUTINE_UNAVAILABLE:
      "Routine recording is unavailable for this date or special-day plan.",
    WORKFLOW_EXPIRED:
      "The routine-recording questions expired or do not belong to this authorization.",
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
  toolName: DaybookToolName,
  input: Record<string, unknown>,
) {
  return createDaybookService(
    await getRepository(),
    await contextFor(ctx, toolName, input),
  );
}

async function contextFor(
  ctx: ToolContext,
  toolName: DaybookToolName,
  input: Record<string, unknown>,
  hashInput: Record<string, unknown> = input,
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
      oauthClientId: authInfo.clientId,
    },
    operation: operationId
      ? {
          source: "mcp",
          clientKey: authInfo.clientId,
          operationName: toolName,
          operationId: mutationId.parse(operationId),
          inputHash: sha256(canonicalJson(hashInput)),
          expectedRecordVersion:
            typeof input.recordVersion === "string"
              ? input.recordVersion
              : undefined,
          expectedDayVersion:
            typeof input.dayVersion === "string" ? input.dayVersion : undefined,
        }
      : undefined,
  };
  return context;
}

function supportsFormElicitation(ctx: ToolContext): boolean {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const capabilities = envelope?.[CLIENT_CAPABILITIES_META_KEY] as
    | { elicitation?: Record<string, unknown> }
    | undefined;
  const elicitation = capabilities?.elicitation;
  return Boolean(
    elicitation &&
      (Object.keys(elicitation).length === 0 ||
        Object.hasOwn(elicitation, "form")),
  );
}

async function runRoutineTool(input: RecordRoutineItemInput, ctx: ToolContext) {
  try {
    const nativeState = ctx.mcpReq.requestState<RoutineWorkflowState>();
    let prior = nativeState;
    if (!prior && input.continuationToken) {
      try {
        prior = await routineStateCodec.verify(input.continuationToken, ctx);
      } catch {
        throw new Error("WORKFLOW_EXPIRED");
      }
    }
    if (prior && (prior.version !== 1 || prior.round > 4)) {
      throw new Error("WORKFLOW_EXPIRED");
    }

    let nextInput = input;
    if (nativeState) {
      const response = inputResponse(ctx.mcpReq.inputResponses, "routineDetails");
      if (
        response.kind === "elicit" &&
        (response.action === "decline" || response.action === "cancel")
      ) {
        return success(
          { result: "cancelled" as const },
          "Routine recording was cancelled; no record was created.",
        );
      }
      if (response.kind === "elicit" && response.action === "accept") {
        const accepted = acceptedContent(
          ctx.mcpReq.inputResponses,
          "routineDetails",
          routineQuestionSchema(nativeState.questions),
        );
        if (accepted) {
          nextInput = recordRoutineItemInputSchema.parse({
            ...input,
            ...accepted,
            continuationToken: undefined,
          });
        }
      }
    }

    const repository = await getRepository();
    const readContext = await contextFor(ctx, "record_routine_item", {
      operationId: input.operationId,
    });
    const plan = await planRoutineRecording(
      repository,
      readContext,
      nextInput,
      prior,
    );
    if (plan.result === "already_recorded") {
      const existingContext = await contextFor(
        ctx,
        "record_routine_item",
        plan.effectiveInput,
      );
      const written = await repository.recordOperationResult(
        existingContext,
        existingRoutineResult(plan),
      );
      const result = createdRoutineResult(written);
      return success(
        result,
        `Routine item was already recorded as ${result.record.id}; no record was created.`,
      );
    }
    if (plan.result === "needs_input") {
      const round = (prior?.round ?? 0) + 1;
      if (round > 4) throw new Error("WORKFLOW_EXPIRED");
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const state = workflowStateFor(plan, round, expiresAt);
      const continuationToken = await routineStateCodec.mint(state, ctx);
      if (supportsFormElicitation(ctx)) {
        return inputRequired({
          inputRequests: {
            routineDetails: inputRequired.elicit({
              message: "Provide the missing details to record this routine item.",
              requestedSchema: routineQuestionJsonSchema(
                plan.questions,
              ) as unknown as ElicitRequestFormParams["requestedSchema"],
            }),
          },
          requestState: continuationToken,
        });
      }
      return success(
        {
          result: plan.result,
          questions: plan.questions,
          resolvedContext: plan.resolvedContext,
          continuationToken,
          expiresAt,
        },
        "More information is required before the routine item can be recorded.",
      );
    }

    const writeContext = await contextFor(
      ctx,
      "record_routine_item",
      {
        ...plan.effectiveInput,
        dayVersion: plan.snapshot.dayVersion,
      },
      plan.effectiveInput,
    );
    if (
      plan.snapshot.dayVersion &&
      (await repository.getDayVersion(writeContext, plan.mutation.localDate)) !==
        plan.snapshot.dayVersion
    ) {
      throw new Error("VERSION_CONFLICT");
    }
    const written = await repository.createCareEntry(writeContext, plan.mutation);
    const result = createdRoutineResult(written);
    return success(
      result,
      result.result === "created"
        ? `Created routine record ${result.record.id}.`
        : `Routine item was already recorded as ${result.record.id}; no record was created.`,
    );
  } catch (error) {
    return failure(error);
  }
}

async function runTool<T>(work: () => Promise<T>, summary: (value: T) => string) {
  try {
    const data = await work();
    return success(data, summary(data));
  } catch (error) {
    return failure(error);
  }
}

function registrationMetadata(name: DaybookToolName) {
  const { title, description, annotations } = getDaybookTool(name);
  return { title, description, annotations };
}

const rawHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_daybook_context",
      {
        ...registrationMetadata("get_daybook_context"),
        inputSchema: z.object({}),
        outputSchema,
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
        ...registrationMetadata("get_day"),
        inputSchema: z.object({ localDate: z.string().date() }),
        outputSchema,
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
        ...registrationMetadata("get_care_entry"),
        inputSchema: z.object({ recordId: z.string().min(1) }),
        outputSchema,
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
        ...registrationMetadata("create_care_entry"),
        inputSchema: daybookCreateCareEntrySchema.extend({ operationId: mutationId }),
        outputSchema,
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
      "record_routine_item",
      {
        ...registrationMetadata("record_routine_item"),
        inputSchema: recordRoutineItemInputSchema,
        outputSchema: routineOutputSchema,
      },
      runRoutineTool,
    );

    server.registerTool(
      "update_care_entry",
      {
        ...registrationMetadata("update_care_entry"),
        inputSchema: careEntryUpdateSchema.safeExtend({
          recordVersion: version,
          operationId: mutationId,
        }),
        outputSchema,
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
        ...registrationMetadata("update_day_notes"),
        inputSchema: dailyLogNotesSchema.extend({
          dayVersion: version,
          operationId: mutationId,
        }),
        outputSchema,
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
        ...registrationMetadata("preview_care_entry_correction"),
        inputSchema: careEntryCorrectionSchema.safeExtend({
          recordVersion: version,
          operationId: mutationId,
        }),
        outputSchema,
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
        ...registrationMetadata("confirm_care_entry_correction"),
        inputSchema: z.object({
          confirmationHandle: handle,
          operationId: mutationId,
        }),
        outputSchema,
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
        ...registrationMetadata("preview_day_finalization"),
        inputSchema: z.object({
          localDate: z.string().date(),
          dayVersion: version,
          operationId: mutationId,
        }),
        outputSchema,
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
        ...registrationMetadata("confirm_day_finalization"),
        inputSchema: z.object({
          confirmationHandle: handle,
          operationId: mutationId,
        }),
        outputSchema,
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
    serverInfo: { name: "family-daybook", version: "1.1.0" },
    instructions:
      "Use get_daybook_context first. Prefer record_routine_item for named routine completions; answer its questions or retry with its continuation token. Never guess IDs. Fetch fresh versions before other mutations. Corrections and finalization require preview followed by confirmation.",
    maxSubscriptions: 0,
    inputRequired: { maxRounds: 4, roundTimeoutMs: 5 * 60 * 1000 },
    requestState: { verify: routineStateCodec.verify },
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
  const requiredScope =
    toolName && isDaybookToolName(toolName) ? TOOL_SCOPES[toolName] : undefined;
  if (requiredScope && !request.auth?.scopes.includes(requiredScope)) {
    const resourceMetadataUrl = new URL(
      "/.well-known/oauth-protected-resource/mcp",
      getSiteUrl(),
    ).toString();
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
    const resourceUrl = new URL("/mcp", getSiteUrl()).toString();
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
