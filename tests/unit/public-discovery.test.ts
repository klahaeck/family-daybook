import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as capabilitiesGet } from "@/app/agent-capabilities.json/route";
import { GET as openAiChallengeGet } from "@/app/.well-known/openai-apps-challenge/route";
import { GET as indexNowKeyGet } from "@/app/indexnow-key.txt/route";
import { GET as llmsGet } from "@/app/llms.txt/route";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { serializeJsonLd } from "@/components/metadata/json-ld";
import { DAYBOOK_TOOL_CATALOG } from "@/lib/mcp/catalog";
import { PUBLIC_PAGES } from "@/lib/metadata/public-pages";
import { homeStructuredData, pageStructuredData } from "@/lib/metadata/structured-data";

const origin = "https://www.myfamilydaybook.com";

afterEach(() => vi.unstubAllEnvs());

describe("public discovery surfaces", () => {
  it("serializes safe structured data with stable canonical identifiers", () => {
    const siteUrl = new URL(origin);
    const home = homeStructuredData(siteUrl);
    const detail = pageStructuredData({
      siteUrl,
      path: "/agent-access",
      name: "Agent <access>",
      description: "Authorized tools",
      breadcrumbs: [
        { name: "Family Daybook", path: "/" },
        { name: "Agent access", path: "/agent-access" },
      ],
    });
    const serialized = serializeJsonLd([home, detail]);

    expect(serialized).toContain(`${origin}/#publisher`);
    expect(serialized).toContain("Agent \\u003caccess>");
    expect(serialized).not.toContain("Agent <access>");
    expect(serialized).not.toMatch(/\"(?:address|email|jurisdiction)\"/i);
  });

  it("publishes the catalog-derived capability manifest without private fields", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
    const response = capabilitiesGet();
    const body = await response.json();

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(body.mcp).toMatchObject({
      endpoint: `${origin}/mcp`,
      transport: "streamable-http",
    });
    expect(body.tools).toHaveLength(10);
    expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual(
      DAYBOOK_TOOL_CATALOG.map((tool) => tool.name),
    );
    expect(JSON.stringify(body)).not.toMatch(
      /apiKey|secret|SUPPORT_TO_EMAIL|inputSchema|outputSchema|internalId/i,
    );
  });

  it("publishes an llms navigation aid using canonical URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
    const response = llmsGet();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain(`${origin}/agent-capabilities.json`);
    expect(body).toContain(`${origin}/features/record-integrity`);
    expect(body).toContain("navigation aid");
  });

  it("keeps sitemap and robots generated from the public contract", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
    const sitemapEntries = sitemap();
    expect(sitemapEntries.map((entry) => entry.url)).toEqual(
      PUBLIC_PAGES.map((page) => new URL(page.path, origin).toString()),
    );
    expect(sitemapEntries.every((entry) => !("lastModified" in entry))).toBe(true);
    expect(sitemapEntries.some((entry) => entry.url.endsWith("/support"))).toBe(false);

    const rules = robots();
    expect(rules.rules).toMatchObject({
      userAgent: "*",
      disallow: expect.arrayContaining(["/app", "/api", "/.well-known/workflow/"]),
    });
    expect(JSON.stringify(rules.rules)).not.toContain('"/.well-known"');
  });

  it("serves the IndexNow key only when valid", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    expect(indexNowKeyGet().status).toBe(404);
    vi.stubEnv("INDEXNOW_KEY", "valid-key-1234");
    const response = indexNowKeyGet();
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("valid-key-1234\n");
  });

  it("serves only the configured OpenAI domain challenge token", async () => {
    vi.stubEnv("OPENAI_APPS_CHALLENGE_TOKEN", "");
    expect(openAiChallengeGet().status).toBe(404);
    vi.stubEnv("OPENAI_APPS_CHALLENGE_TOKEN", "portal-verification-token");
    const response = openAiChallengeGet();
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("portal-verification-token");
  });

  it("keeps the registry metadata on the verified DNS namespace", async () => {
    const serverJsonPath = fileURLToPath(
      new URL("../../server.json", import.meta.url),
    );
    const metadata = JSON.parse(await readFile(serverJsonPath, "utf8"));
    expect(metadata).toMatchObject({
      name: "com.myfamilydaybook/family-daybook",
      title: "Family Daybook",
      remotes: [
        {
          type: "streamable-http",
          url: `${origin}/mcp`,
        },
      ],
    });
  });
});
