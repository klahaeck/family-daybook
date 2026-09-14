export const CANONICAL_SITE_ORIGIN = "https://www.myfamilydaybook.com";

interface SiteUrlEnvironment {
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
}

function invalidSiteUrl(message: string): never {
  throw new Error(`INVALID_SITE_URL: ${message}`);
}

export function getSiteUrl(
  environment: SiteUrlEnvironment = process.env,
): URL {
  const configured = environment.NEXT_PUBLIC_APP_URL?.trim();

  if (!configured) {
    if (environment.NODE_ENV === "production") {
      return invalidSiteUrl(
        `NEXT_PUBLIC_APP_URL must be set to ${CANONICAL_SITE_ORIGIN} in production.`,
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
  if (environment.NODE_ENV === "production" && url.origin !== CANONICAL_SITE_ORIGIN) {
    return invalidSiteUrl(
      `Production must use the canonical origin ${CANONICAL_SITE_ORIGIN}.`,
    );
  }

  return new URL(url.origin);
}
