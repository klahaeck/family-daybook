# Native mobile architecture

Family Daybook ships one Expo/React Native codebase for iOS and Android. The existing Next.js application remains the system of record and exposes a Clerk-authenticated `/api/v1` surface. Mobile does not call the MCP transport.

## Boundaries

- `apps/mobile`: Expo Router screens, Clerk Native auth/profile UI, SecureStore-backed Clerk tokens, and in-memory TanStack Query caching.
- `packages/contracts`: Zod request/response contracts shared by mobile tooling.
- `packages/api-client`: Bearer-token API client, response validation, `If-Match`, and UUID idempotency keys.
- `src/app/api/v1`: versioned native API. Private responses use `Cache-Control: private, no-store` and stable `{ data }` / `{ error }` envelopes.
- `src/lib/application` and `src/lib/repository`: shared authorization, validation, persistence, revisions, auditing, operation replay, and record invariants used by web, mobile API, and MCP.

Mobile mutation attribution is transport-neutral: every request carries a UUID `Idempotency-Key`; version-sensitive changes also carry `If-Match`. The repository stores the source, client key, operation name, operation ID, input hash, and expected version atomically with the mutation. MCP 1.1 keeps its OAuth client attribution, eleven-tool catalog, `record_routine_item` form elicitation, signed five-minute continuation fallback, and routine-slot uniqueness while sharing the same operation layer.

## Authentication and billing

Enable Clerk Native API and register `com.myfamilydaybook.app` for both platforms. The app's non-dismissible Clerk `AuthView` supports sign-in and signup, and Clerk stores session tokens through Expo SecureStore. API authorization is derived only from the verified Clerk bearer token and server-side workspace membership; clients cannot choose a workspace or operation client key.

The session endpoint returns server-authoritative billing state and role capabilities. Clerk's native Billing object is used only for plan and statement reads. Checkout follows this sequence:

1. The owner requests a short-lived, idempotent server billing intent.
2. iOS opens the same-origin `/mobile/subscribe` URL in the system browser.
3. Android obtains a fresh Google external transaction token and uses the native Play Billing `launchExternalLink` operation. It fails closed until that native adapter and program enrollment are complete.
4. The web page authenticates the same Clerk user and renders Clerk's web Pricing Table.
5. Signed Clerk Billing webhooks idempotently complete the intent; the mobile app refreshes `/api/v1/session` after the universal-link return.

No payment details are collected by the native app and no Apple or Google payment processor is represented as handling the web transaction. Store policy and program eligibility must be re-reviewed at release time.

## Release gates

Before a production build:

1. Set all root mobile/billing environment values from `.env.example`, including the verified Vercel Blob callback key/origin for presigned uploads, while leaving Google external links disabled until approval and reporting are operational.
2. Add the real Apple Team ID to both the server and the mobile build environment, plus the Android release certificate fingerprint. Without `APPLE_APP_TEAM_ID`, local iOS Simulator builds intentionally omit Apple Sign-In and Associated Domains so they do not require signing. The server publishes `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`; both return 503 while unconfigured.
3. Implement `FamilyDaybookExternalLinks` in the Android native project with Play Billing eligibility, one-use token creation, `launchExternalLink`, and Google external-transaction reporting credentials. The checked-in JavaScript adapter intentionally blocks without it.
4. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run mobile:test`, `npm run mobile:doctor`, and native preview builds on physical iOS and Android devices.
5. Test signup, MFA/session tasks, reviewer read-only access, stale-version recovery, repeated idempotency keys, background/foreground refresh, link expiry, webhook delay, report sharing, attachment access, and two-stage account deletion.
6. Roll out `/api/v1` behind `MOBILE_API_ENABLED`; use `MOBILE_API_MAINTENANCE` and `MOBILE_MINIMUM_SUPPORTED_VERSION` as emergency controls. Start with internal EAS builds, then TestFlight/Play internal testing, staged production, and monitored expansion.

Account deletion writes a subject-hashed progress receipt outside the workspace before removing application data. That receipt resumes billing and blob cleanup after interrupted responses and blocks automatic workspace bootstrap while the Clerk identity still exists; the mobile recovery screen then completes Clerk identity deletion.
