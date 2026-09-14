import { getSiteUrl } from "@/lib/metadata/site-url";

export const dynamic = "force-static";

export function GET() {
  const siteUrl = getSiteUrl();
  const url = (path: string) => new URL(path, siteUrl).toString();
  const body = `# Family Daybook

> Private family recordkeeping for caregiving, appointments, factual notes, visible corrections, and organized reports.

## Product and agent access
- ${url("/")} — Product overview
- ${url("/agent-access")} — MCP connection, permissions, tools, and safeguards
- ${url("/agent-capabilities.json")} — Machine-readable public capability manifest
- ${url("/co-parenting-recordkeeping")} — Co-parenting recordkeeping overview

## Feature evidence
- ${url("/features/record-integrity")} — Record timestamps, finalization, corrections, and linked hashes
- ${url("/features/report-packages")} — PDFs, source files, manifests, checksums, and snapshots
- ${url("/features/reviewer-access")} — Read-only reviewer access to finalized records
- ${url("/guides/factual-family-records")} — Guide to observable, factual recordkeeping

## Policies and support
- ${url("/privacy")} — Privacy policy
- ${url("/terms")} — Terms of use
- ${url("/support")} — Private support form

This file is a navigation aid. The linked canonical pages and capability manifest are the authoritative public descriptions.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
