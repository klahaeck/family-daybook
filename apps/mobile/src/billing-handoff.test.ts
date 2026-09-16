import { billingLinkInputForPlatform, isBillingCompletionUrl, launchCheckoutForPlatform } from "./billing-handoff";

describe("billing platform handoff", () => {
  it("does not request a Google token for iOS", async () => {
    const getToken = jest.fn(async () => "unused-token-value");
    await expect(billingLinkInputForPlatform("ios", getToken)).resolves.toEqual({ platform: "ios" });
    expect(getToken).not.toHaveBeenCalled();
  });

  it("gets a fresh Google token for every Android intent", async () => {
    let tokenCalls = 0;
    const getToken = jest.fn(async () => `fresh-token-value-${++tokenCalls}`);
    await billingLinkInputForPlatform("android", getToken);
    await billingLinkInputForPlatform("android", getToken);
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("never opens the system browser on Android", async () => {
    const openIosBrowser = jest.fn(async () => undefined);
    const launchAndroidExternalLink = jest.fn(async () => undefined);
    await launchCheckoutForPlatform("android", "https://example.test/checkout", { openIosBrowser, launchAndroidExternalLink });
    expect(launchAndroidExternalLink).toHaveBeenCalledWith("https://example.test/checkout");
    expect(openIosBrowser).not.toHaveBeenCalled();
  });

  it("recognizes only the billing completion route", () => {
    const origin = "https://stage.myfamilydaybook.com";
    expect(isBillingCompletionUrl(`${origin}/mobile/complete?intent=123`, origin)).toBe(true);
    expect(isBillingCompletionUrl(`${origin}/mobile/complete/extra`, origin)).toBe(false);
    expect(isBillingCompletionUrl("https://www.myfamilydaybook.com/mobile/complete", origin)).toBe(false);
    expect(isBillingCompletionUrl("familydaybook://unrelated", origin)).toBe(false);
  });
});
