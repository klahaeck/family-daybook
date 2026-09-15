import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DAYBOOK_SCOPES,
  daybookMcpHandler,
  daybookScopeGate,
  TOOL_SCOPES,
} from "@/lib/mcp/daybook-mcp";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { daybookCreateCareEntrySchema } from "@/lib/application/daybook-service";
import type { Identity } from "@/lib/auth/identity";
import { localDateInTimezone } from "@/lib/domain/dates";
import { DAYBOOK_TOOL_CATALOG } from "@/lib/mcp/catalog";
import {
  MemoryParentingRepository,
  resetMemoryRepository,
} from "@/lib/repository/memory-repository";
import { resetRepositoryForTests } from "@/lib/repository";
import type { RequestContext } from "@/lib/repository/repository";

const canonicalOrigin = "https://www.myfamilydaybook.com";
const modernProtocolVersion = "2026-07-28";
const identity: Identity = {
  authUserId: "demo_owner",
  email: "owner@example.local",
  displayName: "Demo owner",
  mfaEnabled: true,
  demo: true,
};

async function mcpPayload(response: Response) {
  const text = await response.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  return JSON.parse(dataLine ? dataLine.slice(6) : text);
}

function toolRequest(options: {
  arguments: Record<string, unknown>;
  context: RequestContext;
  clientId?: string;
  formElicitation?: boolean;
  requestState?: string;
  inputResponses?: Record<string, unknown>;
  modern?: boolean;
}) {
  const modern = options.modern ?? false;
  const clientId = options.clientId ?? "https://approved-client.example/mcp.json";
  const request = new Request("https://daybook.example/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(modern
        ? {
            "MCP-Protocol-Version": modernProtocolVersion,
            "Mcp-Method": "tools/call",
            "Mcp-Name": "record_routine_item",
          }
        : { "MCP-Protocol-Version": "2025-06-18" }),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name: "record_routine_item",
        arguments: options.arguments,
        ...(options.requestState ? { requestState: options.requestState } : {}),
        ...(options.inputResponses
          ? { inputResponses: options.inputResponses }
          : {}),
        ...(modern
          ? {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": modernProtocolVersion,
                "io.modelcontextprotocol/clientInfo": {
                  name: "family-daybook-contract-test",
                  version: "1.0.0",
                },
                "io.modelcontextprotocol/clientCapabilities": options.formElicitation
                  ? { elicitation: { form: {} } }
                  : {},
              },
            }
          : {}),
      },
    }),
  });
  request.auth = {
    token: "opaque-token",
    clientId,
    scopes: Object.values(DAYBOOK_SCOPES),
    extra: {
      userId: identity.authUserId,
      daybookContext: options.context,
    },
  } satisfies AuthInfo;
  return request;
}

describe("Daybook MCP contract", () => {
  beforeEach(() => {
    resetMemoryRepository();
    resetRepositoryForTests();
  });
  it("maps every tool to its least-privilege scope", () => {
    expect(TOOL_SCOPES).toEqual({
      get_daybook_context: DAYBOOK_SCOPES.read,
      get_day: DAYBOOK_SCOPES.read,
      get_care_entry: DAYBOOK_SCOPES.read,
      create_care_entry: DAYBOOK_SCOPES.write,
      record_routine_item: DAYBOOK_SCOPES.write,
      update_care_entry: DAYBOOK_SCOPES.write,
      update_day_notes: DAYBOOK_SCOPES.write,
      preview_care_entry_correction: DAYBOOK_SCOPES.write,
      confirm_care_entry_correction: DAYBOOK_SCOPES.write,
      preview_day_finalization: DAYBOOK_SCOPES.finalize,
      confirm_day_finalization: DAYBOOK_SCOPES.finalize,
    });
  });

  it("does not expose local demo data when Clerk and Mongo are absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("MONGODB_URI", "");
    const response = await daybookMcpHandler(
      new Request("http://localhost:3000/mcp", { method: "POST" }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "MCP_UNAVAILABLE" });
    vi.unstubAllEnvs();
  });

  it("returns a protected-resource challenge when no bearer token is sent", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", canonicalOrigin);
    vi.stubEnv(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      `pk_test_${Buffer.from("clerk.example$").toString("base64url")}`,
    );
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_example");
    vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:27017");
    const response = await daybookMcpHandler(
      new Request(`${canonicalOrigin}/mcp`, { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `${canonicalOrigin}/.well-known/oauth-protected-resource/mcp`,
    );
    vi.unstubAllEnvs();
  });

  it("rejects an MCP tool call with a standards-compliant scope challenge", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", canonicalOrigin);
    const request = new Request("https://daybook.example/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "confirm_day_finalization", arguments: {} },
      }),
    });
    request.auth = {
      token: "opaque-token",
      clientId: "https://approved-client.example/mcp.json",
      scopes: [DAYBOOK_SCOPES.read],
    } satisfies AuthInfo;

    const response = await daybookScopeGate(request);
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain(
      "insufficient_scope",
    );
    expect(response.headers.get("www-authenticate")).toContain(
      DAYBOOK_SCOPES.finalize,
    );
    expect(response.headers.get("www-authenticate")).toContain(
      "/.well-known/oauth-protected-resource/mcp",
    );

    const modern = new Request("https://daybook.example/mcp", {
      method: "POST",
      headers: {
        "Mcp-Method": "tools/call",
        "Mcp-Name": "update_day_notes",
      },
    });
    modern.auth = {
      token: "opaque-token",
      clientId: "https://approved-client.example/mcp.json",
      scopes: [DAYBOOK_SCOPES.read],
    } satisfies AuthInfo;
    const modernResponse = await daybookScopeGate(modern);
    expect(modernResponse.status).toBe(403);
    expect(modernResponse.headers.get("www-authenticate")).toContain(
      DAYBOOK_SCOPES.write,
    );
    vi.unstubAllEnvs();
  });

  it("requires exactly one typed source for care-entry creation", () => {
    const details = {
      localDate: "2026-09-14",
      childIds: ["child_one"],
      caregiverIds: ["caregiver_one"],
      status: "completed" as const,
      occurredAt: "2026-09-14T12:00:00.000Z",
    };
    expect(
      daybookCreateCareEntrySchema.safeParse({
        ...details,
        source: { kind: "routine", templateItemId: "routine_one" },
      }).success,
    ).toBe(true);
    expect(
      daybookCreateCareEntrySchema.safeParse({
        ...details,
        source: {
          kind: "routine",
          arrangementTaskId: "arrangement_one",
        },
      }).success,
    ).toBe(false);
    expect(
      daybookCreateCareEntrySchema.safeParse({
        ...details,
        source: { kind: "custom" },
      }).success,
    ).toBe(false);
  });

  it("lists the complete structured tool surface through the HTTP handler", async () => {
    const request = new Request("https://daybook.example/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    request.auth = {
      token: "opaque-token",
      clientId: "https://approved-client.example/mcp.json",
      scopes: Object.values(DAYBOOK_SCOPES),
    } satisfies AuthInfo;

    const response = await daybookScopeGate(request);
    expect(response.status).toBe(200);
    const responseText = await response.text();
    const dataLine = responseText
      .split("\n")
      .find((line) => line.startsWith("data: "));
    expect(dataLine).toBeDefined();
    const payload = JSON.parse(dataLine!.slice(6)) as {
      result: { tools: Array<Record<string, unknown>> };
    };
    expect(payload.result.tools.map((tool) => tool.name)).toEqual(
      Object.keys(TOOL_SCOPES),
    );
    for (const [index, tool] of payload.result.tools.entries()) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
      expect(tool).toMatchObject({
        name: DAYBOOK_TOOL_CATALOG[index].name,
        title: DAYBOOK_TOOL_CATALOG[index].title,
        description: DAYBOOK_TOOL_CATALOG[index].description,
        annotations: DAYBOOK_TOOL_CATALOG[index].annotations,
      });
    }
    const routineTool = payload.result.tools.find(
      (tool) => tool.name === "record_routine_item",
    )!;
    expect(routineTool).toMatchObject({
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    });
    expect(routineTool.inputSchema).toMatchObject({
      required: ["operationId"],
      properties: {
        operationId: expect.any(Object),
        routineName: expect.any(Object),
        continuationToken: expect.any(Object),
      },
    });
    const serializedOutput = JSON.stringify(routineTool.outputSchema);
    for (const result of [
      "needs_input",
      "created",
      "already_recorded",
      "cancelled",
    ]) {
      expect(serializedOutput).toContain(result);
    }
  });

  it("advertises MCP server version 1.1.0", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const request = new Request("https://daybook.example/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "contract-test", version: "1.0.0" },
        },
      }),
    });
    request.auth = {
      token: "opaque-token",
      clientId: "https://approved-client.example/mcp.json",
      scopes: Object.values(DAYBOOK_SCOPES),
      extra: { userId: identity.authUserId, daybookContext: context },
    } satisfies AuthInfo;
    const payload = await mcpPayload(await daybookScopeGate(request));
    expect(payload.result.serverInfo).toMatchObject({
      name: "family-daybook",
      version: "1.1.0",
    });
  });

  it("publishes the exact protected resource and supported scopes", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", canonicalOrigin);
    vi.stubEnv(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      `pk_test_${Buffer.from("clerk.example$").toString("base64url")}`,
    );
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_example");
    vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:27017");
    const { GET } = await import(
      "@/app/.well-known/oauth-protected-resource/mcp/route"
    );
    const response = GET(
      new Request("https://daybook.example/.well-known/oauth-protected-resource/mcp"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: `${canonicalOrigin}/mcp`,
      scopes_supported: Object.values(DAYBOOK_SCOPES),
    });
    vi.unstubAllEnvs();
  });

  it("uses native input_required forms, supports dependent rounds, and cancels without mutation", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const initialEntryCount = globalThis.__parentingLogState!.careEntries.length;
    const operationId = "4ce076be-4ce1-4d30-b8a2-b63201b8fb3d";
    const first = await mcpPayload(
      await daybookScopeGate(
        toolRequest({
          context,
          modern: true,
          formElicitation: true,
          arguments: { operationId, routineName: "Bedtime story" },
        }),
      ),
    );

    expect(first.result).toMatchObject({ resultType: "input_required" });
    expect(
      first.result.inputRequests.routineDetails.params.requestedSchema.required,
    ).toEqual(["localDate", "status"]);
    expect(globalThis.__parentingLogState!.careEntries).toHaveLength(
      initialEntryCount,
    );

    const localDate = localDateInTimezone(new Date(), context.workspace.timezone);
    const second = await mcpPayload(
      await daybookScopeGate(
        toolRequest({
          context,
          modern: true,
          formElicitation: true,
          requestState: first.result.requestState,
          inputResponses: {
            routineDetails: {
              action: "accept",
              content: { localDate, status: "completed" },
            },
          },
          arguments: { operationId, routineName: "Bedtime story" },
        }),
      ),
    );

    expect(second.result).toMatchObject({ resultType: "input_required" });
    expect(
      second.result.inputRequests.routineDetails.params.requestedSchema.required,
    ).toEqual(["caregiverIds", "localTime"]);
    expect(globalThis.__parentingLogState!.careEntries).toHaveLength(
      initialEntryCount,
    );

    const cancelled = await mcpPayload(
      await daybookScopeGate(
        toolRequest({
          context,
          modern: true,
          formElicitation: true,
          requestState: second.result.requestState,
          inputResponses: {
            routineDetails: { action: "cancel" },
          },
          arguments: { operationId, routineName: "Bedtime story" },
        }),
      ),
    );
    expect(cancelled.result.structuredContent.data).toEqual({
      result: "cancelled",
    });
    expect(globalThis.__parentingLogState!.careEntries).toHaveLength(
      initialEntryCount,
    );
  });

  it("validates native form answers before creating the routine record", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const localDate = localDateInTimezone(new Date(), context.workspace.timezone);
    const caregiverId = (await repository.getSettings(context)).caregivers[0].id;
    const initialEntryCount = globalThis.__parentingLogState!.careEntries.length;
    const operationId = "1dbf4d48-98b9-44c8-98ff-5b1381831e13";
    const arguments_ = {
      operationId,
      localDate,
      routineName: "Bedtime story",
      status: "completed",
    };
    const first = await mcpPayload(
      await daybookScopeGate(
        toolRequest({
          context,
          modern: true,
          formElicitation: true,
          arguments: arguments_,
        }),
      ),
    );
    const invalid = await mcpPayload(
      await daybookScopeGate(
        toolRequest({
          context,
          modern: true,
          formElicitation: true,
          requestState: first.result.requestState,
          inputResponses: {
            routineDetails: {
              action: "accept",
              content: { caregiverIds: ["not-active"], localTime: "20:10" },
            },
          },
          arguments: arguments_,
        }),
      ),
    );
    expect(invalid.result.resultType).toBe("input_required");
    expect(globalThis.__parentingLogState!.careEntries).toHaveLength(
      initialEntryCount,
    );

    const accepted = await mcpPayload(
      await daybookScopeGate(
        toolRequest({
          context,
          modern: true,
          formElicitation: true,
          requestState: invalid.result.requestState,
          inputResponses: {
            routineDetails: {
              action: "accept",
              content: { caregiverIds: [caregiverId], localTime: "20:10" },
            },
          },
          arguments: arguments_,
        }),
      ),
    );
    expect(accepted.result.structuredContent.data).toMatchObject({
      result: "created",
      record: { taskKey: "bedtime_story" },
      recordVersion: expect.any(String),
    });
    expect(globalThis.__parentingLogState!.careEntries).toHaveLength(
      initialEntryCount + 1,
    );
  });

  it("returns a conversational fallback and rejects tampered or cross-client continuations", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const operationId = "e12740ba-45f2-4d73-a216-6edab48eb179";
    const first = await mcpPayload(
      await daybookScopeGate(
        toolRequest({
          context,
          arguments: { operationId, routineName: "Bedtime story" },
        }),
      ),
    );
    const needsInput = first.result.structuredContent.data;
    expect(needsInput).toMatchObject({
      result: "needs_input",
      continuationToken: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(needsInput.questions.map((item: { field: string }) => item.field)).toEqual([
      "localDate",
      "status",
    ]);

    const tampered = `${needsInput.continuationToken.slice(0, -1)}x`;
    const tamperedResult = await mcpPayload(
      await daybookScopeGate(
        toolRequest({
          context,
          arguments: { operationId, continuationToken: tampered },
        }),
      ),
    );
    expect(tamperedResult.result.structuredContent.error.code).toBe(
      "WORKFLOW_EXPIRED",
    );

    const crossClient = await mcpPayload(
      await daybookScopeGate(
        toolRequest({
          context,
          clientId: "https://other-client.example/mcp.json",
          arguments: {
            operationId,
            continuationToken: needsInput.continuationToken,
          },
        }),
      ),
    );
    expect(crossClient.result.structuredContent.error.code).toBe(
      "WORKFLOW_EXPIRED",
    );

    const localDate = localDateInTimezone(new Date(), context.workspace.timezone);
    const second = await mcpPayload(
      await daybookScopeGate(
        toolRequest({
          context,
          arguments: {
            operationId,
            continuationToken: needsInput.continuationToken,
            localDate,
            status: "completed",
          },
        }),
      ),
    );
    const secondNeedsInput = second.result.structuredContent.data;
    expect(
      secondNeedsInput.questions.map((item: { field: string }) => item.field),
    ).toEqual(["caregiverIds", "localTime"]);
    const caregiverId = (await repository.getSettings(context)).caregivers[0].id;
    const completed = await mcpPayload(
      await daybookScopeGate(
        toolRequest({
          context,
          arguments: {
            operationId,
            continuationToken: secondNeedsInput.continuationToken,
            caregiverIds: [caregiverId],
            localTime: "20:15",
          },
        }),
      ),
    );
    expect(completed.result.structuredContent.data).toMatchObject({
      result: "created",
      record: { taskKey: "bedtime_story" },
      recordVersion: expect.any(String),
    });
  });

  it("expires conversational continuation tokens after five minutes", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-15T15:00:00.000Z"));
      const repository = new MemoryParentingRepository();
      const context = await repository.resolveContext(identity);
      const operationId = "c14c0ed9-a3d8-4a2f-b9c5-94c7704c86c9";
      const first = await mcpPayload(
        await daybookScopeGate(
          toolRequest({
            context,
            arguments: { operationId, routineName: "Bedtime story" },
          }),
        ),
      );
      const continuationToken =
        first.result.structuredContent.data.continuationToken;
      vi.advanceTimersByTime(5 * 60 * 1000 + 1_000);

      const expired = await mcpPayload(
        await daybookScopeGate(
          toolRequest({
            context,
            arguments: { operationId, continuationToken },
          }),
        ),
      );
      expect(expired.result.structuredContent.error.code).toBe(
        "WORKFLOW_EXPIRED",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
