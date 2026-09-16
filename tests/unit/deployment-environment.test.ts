import { describe, expect, it } from "vitest";

import {
  getAppEnvironment,
  getMobileAppIdentifier,
  isProductionEnvironment,
} from "@/lib/deployment/environment";

describe("deployment environment", () => {
  it("uses APP_ENV before platform environment signals", () => {
    expect(
      getAppEnvironment({
        APP_ENV: "staging",
        NODE_ENV: "production",
        VERCEL_TARGET_ENV: "production",
      }),
    ).toBe("staging");
  });

  it("recognizes Vercel preview and custom staging targets", () => {
    expect(getAppEnvironment({ VERCEL_TARGET_ENV: "preview" })).toBe("preview");
    expect(getAppEnvironment({ VERCEL_TARGET_ENV: "staging" })).toBe("staging");
  });

  it("defaults an unlabelled deployment to production", () => {
    expect(getAppEnvironment({ NODE_ENV: "production" })).toBe("production");
    expect(isProductionEnvironment({})).toBe(true);
  });

  it("fails closed on unsupported explicit environments", () => {
    expect(() => getAppEnvironment({ APP_ENV: "qa" })).toThrow("INVALID_APP_ENV");
  });

  it("selects isolated mobile identifiers", () => {
    expect(getMobileAppIdentifier({ APP_ENV: "development" })).toBe(
      "com.myfamilydaybook.app.dev",
    );
    expect(getMobileAppIdentifier({ APP_ENV: "staging" })).toBe(
      "com.myfamilydaybook.app.beta",
    );
    expect(getMobileAppIdentifier({ APP_ENV: "production" })).toBe(
      "com.myfamilydaybook.app",
    );
  });
});
