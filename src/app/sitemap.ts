import type { MetadataRoute } from "next";

import { isProductionEnvironment } from "@/lib/deployment/environment";
import { PUBLIC_PAGES } from "@/lib/metadata/public-pages";
import { getSiteUrl } from "@/lib/metadata/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isProductionEnvironment()) return [];

  const siteUrl = getSiteUrl();

  return PUBLIC_PAGES.map((page) => ({
    url: new URL(page.path, siteUrl).toString(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
