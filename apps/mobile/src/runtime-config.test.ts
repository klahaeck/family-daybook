import { getMobileRuntimeConfiguration } from "./runtime-config";

describe("mobile runtime configuration", () => {
  it("reads the environment values embedded by app.config", () => {
    expect(
      getMobileRuntimeConfiguration({
        appEnvironment: "staging",
        apiOrigin: "https://stage.myfamilydaybook.com",
        webOrigin: "https://stage.myfamilydaybook.com",
      }),
    ).toEqual({
      environment: "staging",
      apiOrigin: "https://stage.myfamilydaybook.com",
      webOrigin: "https://stage.myfamilydaybook.com",
    });
  });

  it("fails when app.config did not embed a complete environment", () => {
    expect(() => getMobileRuntimeConfiguration(undefined)).toThrow(
      "Mobile runtime environment is not configured",
    );
  });
});
