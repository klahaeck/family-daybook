/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_ORIGIN: string;
    EXPO_PUBLIC_WEB_ORIGIN: string;
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: string;
    EXPO_PUBLIC_EAS_PROJECT_ID?: string;
  }
}
