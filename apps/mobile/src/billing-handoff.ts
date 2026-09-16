export type BillingPlatform = "ios" | "android";

export function isBillingCompletionUrl(url: string, expectedOrigin: string) {
  try {
    const candidate = new URL(url);
    return (
      candidate.origin === new URL(expectedOrigin).origin &&
      candidate.pathname === "/mobile/complete"
    );
  } catch {
    return false;
  }
}

export async function billingLinkInputForPlatform(
  platform: BillingPlatform,
  getAndroidToken: () => Promise<string>,
) {
  if (platform === "ios") return { platform: "ios" as const };
  return { platform: "android" as const, googleExternalTransactionToken: await getAndroidToken() };
}

export async function launchCheckoutForPlatform(
  platform: BillingPlatform,
  checkoutUrl: string,
  adapters: { openIosBrowser: (url: string) => Promise<unknown>; launchAndroidExternalLink: (url: string) => Promise<unknown> },
) {
  if (platform === "android") {
    await adapters.launchAndroidExternalLink(checkoutUrl);
    return;
  }
  await adapters.openIosBrowser(checkoutUrl);
}
