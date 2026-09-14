# Family Daybook

Family Daybook pairs a public brochure site with a private, mobile-first daily family log for factual caregiving records, appointments, incidents, immutable corrections, and organized report packages.

It is a recordkeeping tool, not legal advice, an emergency service, or a guarantee that any record will be admitted or given a particular weight by a court. Ask local counsel what should be collected, retained, disclosed, or submitted.

## What is implemented

- Per-child daily routine templates and a fast “Today” checklist
- Date-range special arrangements with per-child responsibility and independent daily task snapshots
- An isolated private workspace for every authenticated owner account
- Previous-day navigation with historical templates, future-date prevention, and a next-calendar-day grace period before late-entry labeling
- Caregiver attribution when care occurred, explicit caregiver-free missed/not-applicable statuses, relevant times, optional duration, and factual notes
- Scheduled appointments with responsibility and attendance outcomes
- Neutral incident records for safety hazards and concerning interactions
- Direct care-record edits while a day is open, then append-only corrections after finalization
- Server-controlled entry timestamps and visible late-entry labels
- Private JPEG, PNG, HEIC, PDF, MP4, MOV, and WebM attachments with file-signature validation; videos may be up to 50 MB
- Searchable combined timeline and authorized attachment downloads
- Finalized-day visibility for read-only attorney reviewers
- Vercel Workflow report generation with PDF, original files, JSON manifest, and checksum ZIP
- Configurable owner-only hard purge with typed confirmation and content-free tombstones
- MongoDB Atlas persistence plus a clearly marked in-memory local demo mode
- OAuth-protected, stateless Streamable HTTP MCP tools for authorized daily care records at `/mcp`
- Public agent documentation, structured capability metadata, and feature evidence pages
- Private support delivery through a Turnstile-protected web form and Resend

## Local development

Requirements: Node.js 20.19 or newer and npm 11.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the public brochure or [http://localhost:3000/app](http://localhost:3000/app) for the product. With no environment variables, `/app` runs against an in-memory sample workspace. It is intentionally labeled as demo data and must not be used for real records.

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

MongoDB integration tests run when `TEST_MONGODB_URI` is present. Browser tests require Playwright’s Chromium browser (`npx playwright install chromium`).

## Production configuration

Copy `.env.example` to `.env.local` for development. Configure the same values in Vercel for production.

1. Create a dedicated MongoDB Atlas database and least-privilege application user.
2. Create a Clerk application, enable self-service registration, and make MFA available to every owner and reviewer.
3. Create a Vercel Private Blob store.
4. Set `NEXT_PUBLIC_APP_URL` to `https://www.myfamilydaybook.com`; production builds reject any other canonical origin. Keep the apex-to-`www` redirect enabled.
5. Configure Resend and Cloudflare Turnstile for the private `/support` form.
6. Deploy to Vercel. Workflow SDK routes are generated during the Next.js build.
7. Sign in with each owner account. Its first login bootstraps a separate private workspace and initial routine template. A user matching a pending reviewer invitation joins that workspace as a read-only reviewer instead.
8. Replace placeholder child and caregiver names in Settings before entering real records.

Vercel Workflows use the deployment’s managed workflow backend automatically. Private Blob supports either the legacy read/write token or Vercel OIDC plus a store ID.

## Data integrity model

Care records and special arrangements are editable while their daily log is open. Finalization locks the current revision; later changes create a new correction containing the previous revision ID, reason, author, server timestamp, and a hash of the canonical payload plus the previous hash. Reports capture the included revision and attachment IDs at creation time. Special arrangements are planned context, not evidence that care occurred.

The integrity controls are tamper-evident application safeguards, not a claim that the system is tamper-proof or that a report is self-authenticating. Export packages include the underlying manifest and checksums so an attorney can evaluate and preserve them with the originals.

Hard purge is disabled by default. When enabled, it removes active record content, attachments, and stored reports containing the record while retaining a content-free deletion tombstone. Already downloaded copies cannot be revoked, and provider backups expire according to their configured retention policy.

## Architecture

- Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui
- TanStack Query for hydrated interactive reads and cache invalidation
- Validated Server Actions for mutations, presigned direct-to-Blob media uploads, and authenticated GET Route Handlers for reads
- Native MongoDB Node.js driver with Stable API and transactional record/revision/audit writes
- Clerk identity with application roles stored in MongoDB
- Clerk Billing with owner-based access for the paid subscriber `general` Plan
- Per-account MongoDB workspaces with repository-level tenant isolation
- Vercel Private Blob for original files and report artifacts
- React PDF, JSZip, and Vercel Workflow SDK for evidence packages

The repository adapter uses MongoDB when `MONGODB_URI` is configured. The development-only memory adapter is available only when Clerk is not configured, preventing authenticated users from ever sharing demo state.

## Billing access

The public `/pricing` page renders Clerk's user Pricing Table. Private workspace requests verify the workspace owner's Clerk Billing Subscription on the server, including Route Handlers and Server Actions. The default configuration accepts the paid subscriber Plan (`general`) or an explicit `complimentaryAccess: true` value in the owner's Clerk private metadata. The hidden default Free Plan (`free_user`) alone does not grant application access. Override the paid-plan allowlist with the comma-separated `CLERK_ALLOWED_PLAN_SLUGS` environment variable if Plan slugs differ between Clerk instances.

Invited reviewers inherit the workspace owner's billing access. A reviewer is never required to buy a separate Plan, and the server resolves the owner before checking Clerk so this rule applies to pages, API reads, downloads, and mutations.

## Authorized MCP access

The remote MCP endpoint is `https://www.myfamilydaybook.com/mcp`. Public connection guidance is available at `/agent-access`, with a machine-readable summary at `/agent-capabilities.json`. The endpoint uses stateless Streamable HTTP, Clerk OAuth, the same MongoDB workspace membership and billing checks as the web app, and these custom Clerk scopes:

- `daybook:read` for context, days, records, and revision history
- `daybook:write` for open-day entries/notes and confirmed finalized-record corrections
- `daybook:finalize` for previewing and confirming day finalization

Configure Clerk before connecting a client:

1. Add all three custom scopes in the Clerk Dashboard.
2. Keep the OAuth consent screen enabled and select opaque access tokens so revocation takes effect promptly.
3. Enable Client ID Metadata Documents (CIMD) for approved clients only. Leave open Dynamic Client Registration disabled.
4. Approve each MCP host explicitly. For v1 hosts that omit a scope request, configure all three Daybook scopes as that client's defaults.
5. Register the exact production resource URL, including `/mcp`, and smoke-test one approved client after deployment.

OAuth discovery is published at `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`. Every tool derives the Clerk user, workspace, member, and OAuth client from the bearer token; none can be supplied as arguments. Owners may mutate according to granted scopes. Reviewers remain read-only and can retrieve only finalized care days and records.

MCP is deliberately unavailable unless both Clerk and MongoDB are configured. The unauthenticated in-memory demo is never exposed. Mutations require UUID operation IDs, version-bound updates, and five-minute one-time confirmations for finalization and finalized-record corrections.

The integration follows the [MCP 2026-07-28 transport model](https://blog.modelcontextprotocol.io/posts/2026-07-28/) and [Clerk's Next.js MCP guidance](https://clerk.com/docs/nextjs/guides/ai/mcp/build-mcp-server).

Search-engine setup, IndexNow submission, MCP Registry validation, and OpenAI directory preparation are documented in `docs/agent-distribution.md`. Reviewer-ready OpenAI listing copy and tests are in `docs/openai-plugin-submission.md`.
