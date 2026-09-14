import { describe, expect, it } from "vitest";

import {
  CANONICAL_SITE_ORIGIN,
  getSiteUrl,
} from "@/lib/metadata/site-url";

describe("getSiteUrl", () => {
  it("uses localhost only outside production when no URL is configured", () => {
    expect(getSiteUrl({ NODE_ENV: "development" }).toString()).toBe(
      "http://localhost:3000/",
    );
    expect(getSiteUrl({ NODE_ENV: "test" }).toString()).toBe(
      "http://localhost:3000/",
    );
  });

  it("normalizes a configured origin", () => {
    expect(
      getSiteUrl({
        NODE_ENV: "development",
        NEXT_PUBLIC_APP_URL: " https://preview.example:8443 ",
      }).toString(),
    ).toBe("https://preview.example:8443/");
  });

  it.each([
    "not-a-url",
    "ftp://example.com",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com/?query=value",
    "https://example.com/#fragment",
  ])("rejects a non-origin value: %s", (value) => {
    expect(() =>
      getSiteUrl({ NODE_ENV: "development", NEXT_PUBLIC_APP_URL: value }),
    ).toThrow("INVALID_SITE_URL");
  });

  it("requires the canonical www origin in production", () => {
    expect(() => getSiteUrl({ NODE_ENV: "production" })).toThrow(
      CANONICAL_SITE_ORIGIN,
    );
    expect(() =>
      getSiteUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://myfamilydaybook.com",
      }),
    ).toThrow(CANONICAL_SITE_ORIGIN);
    expect(
      getSiteUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: CANONICAL_SITE_ORIGIN,
      }).origin,
    ).toBe(CANONICAL_SITE_ORIGIN);
  });
});
