export const APP_ENVIRONMENTS = [
  "development",
  "preview",
  "staging",
  "production",
  "test",
] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export const MOBILE_APP_IDENTIFIERS = {
  development: "com.myfamilydaybook.app.dev",
  preview: "com.myfamilydaybook.app.dev",
  staging: "com.myfamilydaybook.app.beta",
  production: "com.myfamilydaybook.app",
  test: "com.myfamilydaybook.app.dev",
} as const satisfies Record<AppEnvironment, string>;

export interface AppEnvironmentVariables {
  APP_ENV?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  VERCEL_TARGET_ENV?: string;
}

function invalidAppEnvironment(value: string): never {
  throw new Error(
    `INVALID_APP_ENV: ${value} is not one of ${APP_ENVIRONMENTS.join(", ")}.`,
  );
}

function parseAppEnvironment(value: string | undefined): AppEnvironment | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if ((APP_ENVIRONMENTS as readonly string[]).includes(normalized)) {
    return normalized as AppEnvironment;
  }
  return invalidAppEnvironment(normalized);
}

export function getAppEnvironment(
  environment: AppEnvironmentVariables = process.env,
): AppEnvironment {
  const configured = parseAppEnvironment(environment.APP_ENV);
  if (configured) return configured;

  const vercelTarget =
    parseAppEnvironment(environment.VERCEL_TARGET_ENV) ??
    parseAppEnvironment(environment.VERCEL_ENV);
  if (vercelTarget) return vercelTarget;

  if (environment.NODE_ENV === "development") return "development";
  if (environment.NODE_ENV === "test") return "test";

  // Next.js sets NODE_ENV=production for every non-development build. Defaulting
  // to production keeps an unlabelled deployment fail-closed against the
  // canonical production origin rather than silently treating it as staging.
  return "production";
}

export function getMobileAppIdentifier(
  environment: AppEnvironmentVariables = process.env,
): string {
  return MOBILE_APP_IDENTIFIERS[getAppEnvironment(environment)];
}

export function isProductionEnvironment(
  environment: AppEnvironmentVariables = process.env,
): boolean {
  return getAppEnvironment(environment) === "production";
}
