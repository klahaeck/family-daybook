import Constants from "expo-constants";

export interface MobileRuntimeConfiguration {
  environment: "development" | "staging" | "production";
  apiOrigin: string;
  webOrigin: string;
}

export function getMobileRuntimeConfiguration(
  extra: Record<string, unknown> | undefined = Constants.expoConfig?.extra,
): MobileRuntimeConfiguration {
  const environment = extra?.appEnvironment;
  const apiOrigin = extra?.apiOrigin;
  const webOrigin = extra?.webOrigin;

  if (
    (environment !== "development" &&
      environment !== "staging" &&
      environment !== "production") ||
    typeof apiOrigin !== "string" ||
    typeof webOrigin !== "string"
  ) {
    throw new Error("Mobile runtime environment is not configured.");
  }

  return { environment, apiOrigin, webOrigin };
}
