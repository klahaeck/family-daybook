import {
  resolveMobileAppConfiguration,
  resolveMobileAppEnvironment,
} from "./app-environment";

describe("mobile application environment", () => {
  it("defaults local configuration to an isolated development app", () => {
    expect(resolveMobileAppConfiguration({})).toMatchObject({
      environment: "development",
      name: "Family Daybook Dev",
      bundleIdentifier: "com.myfamilydaybook.app.dev",
      scheme: "familydaybook-dev",
      apiOrigin: "http://localhost:3000",
      webOrigin: "http://localhost:3000",
    });
  });

  it("maps preview and beta builds to staging", () => {
    expect(resolveMobileAppEnvironment({ EAS_BUILD_PROFILE: "preview" })).toBe(
      "staging",
    );
    expect(resolveMobileAppEnvironment({ EAS_BUILD_PROFILE: "beta" })).toBe(
      "staging",
    );
  });

  it("creates a beta app that targets only staging", () => {
    expect(resolveMobileAppConfiguration({ APP_ENV: "staging" })).toMatchObject({
      name: "Family Daybook Beta",
      bundleIdentifier: "com.myfamilydaybook.app.beta",
      scheme: "familydaybook-beta",
      apiOrigin: "https://stage.myfamilydaybook.com",
      webOrigin: "https://stage.myfamilydaybook.com",
    });
  });

  it("preserves production defaults for existing production origins", () => {
    expect(
      resolveMobileAppConfiguration({
        EXPO_PUBLIC_API_ORIGIN: "https://www.myfamilydaybook.com",
        EXPO_PUBLIC_WEB_ORIGIN: "https://www.myfamilydaybook.com",
      }),
    ).toMatchObject({
      environment: "production",
      bundleIdentifier: "com.myfamilydaybook.app",
    });
  });

  it("rejects cross-environment origins", () => {
    expect(() =>
      resolveMobileAppConfiguration({
        APP_ENV: "staging",
        EXPO_PUBLIC_API_ORIGIN: "https://www.myfamilydaybook.com",
      }),
    ).toThrow("INVALID_MOBILE_APP_ENV");
    expect(() =>
      resolveMobileAppEnvironment({
        EXPO_PUBLIC_API_ORIGIN: "https://stage.myfamilydaybook.com",
        EXPO_PUBLIC_WEB_ORIGIN: "https://www.myfamilydaybook.com",
      }),
    ).toThrow("different application environments");
  });
});
