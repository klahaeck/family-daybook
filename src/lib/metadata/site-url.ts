import {
  getAppEnvironment,
  type AppEnvironmentVariables,
} from "@/lib/deployment/environment";

export const CANONICAL_SITE_ORIGIN = "https://www.myfamilydaybook.com";
export const STAGING_SITE_ORIGIN = "https://stage.myfamilydaybook.com";

interface SiteUrlEnvironment extends AppEnvironmentVariables {
  NEXT_PUBLIC_APP_URL?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_URL?: string;
}

function invalidSiteUrl(message: string): never {
  throw new Error(`INVALID_SITE_URL: ${message}`);
}

export function getSiteUrl(
  environment: SiteUrlEnvironment = process.env,
): URL {
  const appEnvironment = getAppEnvironment(environment);
  const vercelPreviewHost =
    environment.VERCEL_BRANCH_URL?.trim() || environment.VERCEL_URL?.trim();
  const configured =
    appEnvironment === "preview" && vercelPreviewHost
      ? `https://${vercelPreviewHost}`
      : environment.NEXT_PUBLIC_APP_URL?.trim();

  if (!configured) {
    if (appEnvironment === "production") {
      return invalidSiteUrl(
        `NEXT_PUBLIC_APP_URL must be set to ${CANONICAL_SITE_ORIGIN} in production.`,
      );
    }
    if (appEnvironment === "staging") {
      return invalidSiteUrl(
        `NEXT_PUBLIC_APP_URL must be set to ${STAGING_SITE_ORIGIN} in staging.`,
      );
    }
    return new URL("http://localhost:3000");
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return invalidSiteUrl("NEXT_PUBLIC_APP_URL must be a valid absolute URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return invalidSiteUrl("NEXT_PUBLIC_APP_URL must use http or https.");
  }
  if (url.username || url.password) {
    return invalidSiteUrl("NEXT_PUBLIC_APP_URL must not contain credentials.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    return invalidSiteUrl(
      "NEXT_PUBLIC_APP_URL must contain only an origin, without a path, query, or fragment.",
    );
  }
  if (appEnvironment === "production" && url.origin !== CANONICAL_SITE_ORIGIN) {
    return invalidSiteUrl(
      `Production must use the canonical origin ${CANONICAL_SITE_ORIGIN}.`,
    );
  }
  if (appEnvironment === "staging" && url.origin !== STAGING_SITE_ORIGIN) {
    return invalidSiteUrl(
      `Staging must use the canonical origin ${STAGING_SITE_ORIGIN}.`,
    );
  }

  return new URL(url.origin);
}
