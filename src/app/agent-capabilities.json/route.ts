import {
  DAYBOOK_SCOPES,
  DAYBOOK_SCOPE_DESCRIPTIONS,
  DAYBOOK_TOOL_CATALOG,
} from "@/lib/mcp/catalog";
import { getSiteUrl } from "@/lib/metadata/site-url";

export const dynamic = "force-static";

export function GET() {
  const siteUrl = getSiteUrl();
  const url = (path: string) => new URL(path, siteUrl).toString();

  return Response.json(
    {
      schemaVersion: "1.0.0",
      name: "Family Daybook",
      description:
        "Private family recordkeeping with factual entries, visible correction history, report packages, reviewer access, and authorized MCP tools.",
      publisher: {
        name: "Family Daybook",
        url: url("/"),
      },
      documentation: {
        agentAccess: url("/agent-access"),
        support: url("/support"),
        privacy: url("/privacy"),
        terms: url("/terms"),
      },
      mcp: {
        endpoint: url("/mcp"),
        transport: "streamable-http",
        authorization: {
          type: "oauth2",
          protectedResourceMetadata: url(
            "/.well-known/oauth-protected-resource/mcp",
          ),
          scopes: Object.values(DAYBOOK_SCOPES).map((scope) => ({
            id: scope,
            description: DAYBOOK_SCOPE_DESCRIPTIONS[scope],
          })),
        },
      },
      tools: DAYBOOK_TOOL_CATALOG.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        scope: tool.scope,
        annotations: tool.annotations,
        requiresConfirmation: tool.requiresConfirmation,
      })),
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    },
  );
}
