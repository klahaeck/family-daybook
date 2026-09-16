import type { ExpoConfig } from "expo/config";

import { resolveMobileAppConfiguration } from "./src/app-environment.ts";

const deployment = resolveMobileAppConfiguration(process.env);
const appleTeamId = process.env.APPLE_APP_TEAM_ID?.trim() || undefined;
const appLinkHost = new URL(deployment.webOrigin).hostname;
const appLinksEnabled = Boolean(appleTeamId) && deployment.webOrigin.startsWith("https://");

const config: ExpoConfig = {
  name: deployment.name,
  slug: "family-daybook",
  version: "1.0.0",
  scheme: deployment.scheme,
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  runtimeVersion: { policy: "appVersion" },
  ios: {
    bundleIdentifier: deployment.bundleIdentifier,
    supportsTablet: true,
    ...(appLinksEnabled
      ? {
          appleTeamId,
          associatedDomains: [`applinks:${appLinkHost}`],
        }
      : {}),
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: deployment.bundleIdentifier,
    adaptiveIcon: { backgroundColor: "#F3F0E8" },
    ...(deployment.webOrigin.startsWith("https://")
      ? {
          intentFilters: [
            {
              action: "VIEW",
              autoVerify: true,
              data: [
                {
                  scheme: "https",
                  host: appLinkHost,
                  pathPrefix: "/mobile/complete",
                },
              ],
              category: ["BROWSABLE", "DEFAULT"],
            },
          ],
        }
      : {}),
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["@clerk/expo", { appleSignIn: Boolean(appleTeamId) }],
  ],
  experiments: { reactCompiler: true },
  extra: {
    appEnvironment: deployment.environment,
    apiOrigin: deployment.apiOrigin,
    webOrigin: deployment.webOrigin,
    eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID },
  },
};

export default config;
