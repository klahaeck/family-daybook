# Family Daybook mobile

The iOS and Android client is an Expo SDK 57 application. It uses the same Clerk application and `/api/v1` backend as the web app. Family records remain in the API and TanStack Query's in-memory cache; only Clerk session material is persisted through SecureStore.

## Local setup

1. Copy `.env.example` to `.env`, keep `APP_ENV=development`, and set a local or LAN-reachable public API origin plus the development Clerk publishable key.
2. Enable Clerk Native API and register `com.myfamilydaybook.app.dev` for local development. Register the `.beta` and production identifiers in their isolated Clerk instances before creating those builds.
3. From the repository root, install workspaces with `npm install`.
4. Create a development build with `npm run mobile:ios -- --device <simulator-uuid>` or `npm run mobile:android`. Clerk's native `AuthView` and `UserProfileView` do not run in Expo Go. Leave `APPLE_APP_TEAM_ID` blank for an unsigned iOS Simulator build; set it for physical-device and release builds. After changing that value, regenerate the iOS project from `apps/mobile` with `npx expo prebuild --clean --platform ios` so the signing capabilities match.

After the development build is installed, start Metro from the repository root with `npm run mobile:start` and press `i` to reopen it in the iOS Simulator.

Run `npm run typecheck:mobile`, `npm run mobile:test`, and `npm run mobile:doctor` before producing an EAS preview build.

## Build environments

- `development` creates **Family Daybook Dev** with `com.myfamilydaybook.app.dev` and local origins.
- `preview` creates an internally distributed **Family Daybook Beta** with `com.myfamilydaybook.app.beta` and `https://stage.myfamilydaybook.com`.
- `beta` creates a store-signed build of the same beta app for TestFlight and the Google Play internal track.
- `production` creates **Family Daybook** with `com.myfamilydaybook.app` and `https://www.myfamilydaybook.com`.

Set `EXPO_PUBLIC_API_ORIGIN`, `EXPO_PUBLIC_WEB_ORIGIN`, the Clerk publishable key, EAS project ID, and Apple team ID in the matching EAS environment. The app configuration rejects staging builds that reference production origins and production builds that reference staging origins.

## Checkout boundary

iOS requests a short-lived server billing intent and opens its `checkoutUrl` in the system browser. Android is fail-closed: it requires a native `FamilyDaybookExternalLinks` module that obtains a fresh Google external transaction token and invokes Play Billing's `launchExternalLink` for the returned URL. The JavaScript adapter intentionally refuses Android checkout until that approved native module is included in the build.

Production app links also require the final Apple Team ID and Android signing certificate to be published in the site's `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` files.
