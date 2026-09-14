import {
  authServerMetadataHandlerClerk,
  metadataCorsOptionsRequestHandler,
} from "@clerk/mcp-tools/next";
import { clerkConfigured } from "@/lib/auth/identity";
import { mongoConfigured } from "@/lib/db/mongodb";

export const dynamic = "force-dynamic";

const clerkMetadata = authServerMetadataHandlerClerk();

export function GET() {
  if (!clerkConfigured() || !mongoConfigured()) {
    return Response.json({ error: "MCP_UNAVAILABLE" }, { status: 503 });
  }
  return clerkMetadata();
}
export const OPTIONS = metadataCorsOptionsRequestHandler();
