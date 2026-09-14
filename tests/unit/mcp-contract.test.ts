import { describe, expect, it, vi } from "vitest";

import {
  DAYBOOK_SCOPES,
  daybookMcpHandler,
  daybookScopeGate,
  TOOL_SCOPES,
} from "@/lib/mcp/daybook-mcp";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { daybookCreateCareEntrySchema } from "@/lib/application/daybook-service";

describe("Daybook MCP contract", () => {
  it("maps every tool to its least-privilege scope", () => {
    expect(TOOL_SCOPES).toEqual({
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
    vi.stubEnv(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      `pk_test_${Buffer.from("clerk.example$").toString("base64url")}`,
    );
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_example");
    vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:27017");
    const response = await daybookMcpHandler(
      new Request("https://daybook.example/mcp", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "https://daybook.example/.well-known/oauth-protected-resource/mcp",
    );
    vi.unstubAllEnvs();
  });

  it("rejects an MCP tool call with a standards-compliant scope challenge", async () => {
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
    for (const tool of payload.result.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations).toBeDefined();
    }
  });

  it("publishes the exact protected resource and supported scopes", async () => {
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
      resource: "https://daybook.example/mcp",
      scopes_supported: Object.values(DAYBOOK_SCOPES),
    });
    vi.unstubAllEnvs();
  });
});
