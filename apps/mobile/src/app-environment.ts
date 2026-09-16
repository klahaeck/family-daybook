export type MobileAppEnvironment = "development" | "staging" | "production";

interface MobileAppEnvironmentVariables {
  APP_ENV?: string;
  EAS_BUILD_PROFILE?: string;
  EXPO_PUBLIC_API_ORIGIN?: string;
  EXPO_PUBLIC_WEB_ORIGIN?: string;
}

interface MobileDeploymentTarget {
  name: string;
  bundleIdentifier: string;
  scheme: string;
  defaultOrigin: string;
}

export interface MobileAppConfiguration extends MobileDeploymentTarget {
  environment: MobileAppEnvironment;
  apiOrigin: string;
  webOrigin: string;
}

const targets: Record<MobileAppEnvironment, MobileDeploymentTarget> = {
  development: {
    name: "Family Daybook Dev",
    bundleIdentifier: "com.myfamilydaybook.app.dev",
    scheme: "familydaybook-dev",
    defaultOrigin: "http://localhost:3000",
  },
  staging: {
    name: "Family Daybook Beta",
    bundleIdentifier: "com.myfamilydaybook.app.beta",
    scheme: "familydaybook-beta",
    defaultOrigin: "https://stage.myfamilydaybook.com",
  },
  production: {
    name: "Family Daybook",
    bundleIdentifier: "com.myfamilydaybook.app",
    scheme: "familydaybook",
    defaultOrigin: "https://www.myfamilydaybook.com",
  },
};

function invalidMobileEnvironment(message: string): never {
  throw new Error(`INVALID_MOBILE_APP_ENV: ${message}`);
}

function environmentFromValue(value: string | undefined): MobileAppEnvironment | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "development" || normalized === "test") return "development";
  if (normalized === "preview" || normalized === "staging") return "staging";
  if (normalized === "production") return "production";
  return invalidMobileEnvironment(`Unsupported APP_ENV ${normalized}.`);
}

function environmentFromBuildProfile(
  profile: string | undefined,
): MobileAppEnvironment | undefined {
  const normalized = profile?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "development") return "development";
  if (normalized === "preview" || normalized === "beta") return "staging";
  if (normalized === "production") return "production";
  return undefined;
}

function configuredOrigin(value: string | undefined, label: string): URL | undefined {
  const configured = value?.trim();
  if (!configured) return undefined;

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return invalidMobileEnvironment(`${label} must be a valid absolute URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return invalidMobileEnvironment(`${label} must use http or https.`);
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return invalidMobileEnvironment(`${label} must contain only an origin.`);
  }
  return new URL(url.origin);
}

function inferEnvironmentFromOrigins(
  environment: MobileAppEnvironmentVariables,
): MobileAppEnvironment | undefined {
  const origins = [
    configuredOrigin(environment.EXPO_PUBLIC_API_ORIGIN, "EXPO_PUBLIC_API_ORIGIN"),
    configuredOrigin(environment.EXPO_PUBLIC_WEB_ORIGIN, "EXPO_PUBLIC_WEB_ORIGIN"),
  ].filter((origin): origin is URL => Boolean(origin));

  const deployedEnvironments = new Set(
    origins.flatMap((origin) =>
      (Object.entries(targets) as [MobileAppEnvironment, MobileDeploymentTarget][])
        .filter(([, target]) => target.defaultOrigin === origin.origin)
        .map(([name]) => name),
    ),
  );

  if (deployedEnvironments.size > 1) {
    return invalidMobileEnvironment(
      "API and web origins resolve to different application environments.",
    );
  }
  return deployedEnvironments.values().next().value;
}

export function resolveMobileAppEnvironment(
  environment: MobileAppEnvironmentVariables,
): MobileAppEnvironment {
  return (
    environmentFromValue(environment.APP_ENV) ??
    environmentFromBuildProfile(environment.EAS_BUILD_PROFILE) ??
    inferEnvironmentFromOrigins(environment) ??
    "development"
  );
}

export function resolveMobileAppConfiguration(
  environment: MobileAppEnvironmentVariables,
): MobileAppConfiguration {
  const appEnvironment = resolveMobileAppEnvironment(environment);
  const target = targets[appEnvironment];
  const apiOrigin =
    configuredOrigin(environment.EXPO_PUBLIC_API_ORIGIN, "EXPO_PUBLIC_API_ORIGIN") ??
    new URL(target.defaultOrigin);
  const webOrigin =
    configuredOrigin(environment.EXPO_PUBLIC_WEB_ORIGIN, "EXPO_PUBLIC_WEB_ORIGIN") ??
    new URL(target.defaultOrigin);

  if (appEnvironment !== "development") {
    for (const [label, origin] of [
      ["EXPO_PUBLIC_API_ORIGIN", apiOrigin],
      ["EXPO_PUBLIC_WEB_ORIGIN", webOrigin],
    ] as const) {
      if (origin.origin !== target.defaultOrigin) {
        return invalidMobileEnvironment(
          `${label} must be ${target.defaultOrigin} for ${appEnvironment}.`,
        );
      }
    }
  }

  return {
    environment: appEnvironment,
    name: target.name,
    bundleIdentifier: target.bundleIdentifier,
    scheme: target.scheme,
    defaultOrigin: target.defaultOrigin,
    apiOrigin: apiOrigin.origin,
    webOrigin: webOrigin.origin,
  };
}
