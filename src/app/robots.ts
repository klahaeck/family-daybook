import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/metadata/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/agent-access",
        "/agent-capabilities.json",
        "/co-parenting-recordkeeping",
        "/features/",
        "/guides/",
        "/llms.txt",
        "/pricing",
        "/privacy",
        "/terms",
        "/.well-known/oauth-authorization-server",
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/openai-apps-challenge",
        "/opengraph-image",
        "/twitter-image",
      ],
      disallow: [
        "/app",
        "/api",
        "/sign-in",
        "/sign-up",
        "/.well-known/workflow/",
      ],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.origin,
  };
}
