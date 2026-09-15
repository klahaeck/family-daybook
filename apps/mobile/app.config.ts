import type { ExpoConfig } from "expo/config";

const bundleIdentifier = "com.myfamilydaybook.app";
const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN ?? "https://www.myfamilydaybook.com";

const config: ExpoConfig = {
  name: "Family Daybook",
  slug: "family-daybook",
  version: "1.0.0",
  scheme: "familydaybook",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  runtimeVersion: { policy: "appVersion" },
  ios: {
    bundleIdentifier,
    supportsTablet: true,
    associatedDomains: ["applinks:www.myfamilydaybook.com"],
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: bundleIdentifier,
    adaptiveIcon: { backgroundColor: "#F3F0E8" },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "www.myfamilydaybook.com", pathPrefix: "/mobile/complete" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: ["expo-router", "expo-secure-store", "@clerk/expo"],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    webOrigin,
    eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID },
  },
};

export default config;
