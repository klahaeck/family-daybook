import { NativeModules, Platform } from "react-native";

interface GoogleExternalLinksModule {
  getGoogleExternalTransactionToken(): Promise<string>;
  launchExternalLink(checkoutUrl: string): Promise<void>;
}

export async function launchGoogleExternalLink(checkoutUrl: string): Promise<void> {
  if (Platform.OS !== "android" || !nativeModule) {
    throw new Error("Web subscription checkout is not available in this Android build. Install the approved Google Play external-links module and try again.");
  }
  await nativeModule.launchExternalLink(checkoutUrl);
}

const nativeModule = NativeModules.FamilyDaybookExternalLinks as GoogleExternalLinksModule | undefined;

export async function getGoogleExternalTransactionToken(): Promise<string> {
  if (Platform.OS !== "android") throw new Error("Google external-link tokens are only available on Android.");
  if (!nativeModule) {
    throw new Error("Web subscription checkout is not available in this Android build. Install the approved Google Play external-links module and try again.");
  }
  const token = await nativeModule.getGoogleExternalTransactionToken();
  if (!token || token.length < 16) throw new Error("Google Play did not provide a valid external transaction token. Please try again.");
  return token;
}
