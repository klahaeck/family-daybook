import {
  corsHeaders,
  generateClerkProtectedResourceMetadata,
} from "@clerk/mcp-tools/server";
import { getPublicOrigin } from "mcp-handler";

import { clerkConfigured } from "@/lib/auth/identity";
import { mongoConfigured } from "@/lib/db/mongodb";
import { DAYBOOK_SCOPES } from "@/lib/mcp/daybook-mcp";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!clerkConfigured() || !mongoConfigured() || !publishableKey) {
    return Response.json({ error: "MCP_UNAVAILABLE" }, { status: 503 });
  }
  const resourceUrl = `${getPublicOrigin(request)}/mcp`;
  return Response.json(
    generateClerkProtectedResourceMetadata({
      publishableKey,
      resourceUrl,
      properties: {
        scopes_supported: Object.values(DAYBOOK_SCOPES),
        resource_name: "Family Daybook",
      },
    }),
    { headers: { ...corsHeaders, "Cache-Control": "public, max-age=300" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
