import { useAuth } from "@clerk/expo";
import { DaybookApiClient } from "@family-daybook/api-client";
import NetInfo from "@react-native-community/netinfo";
import { QueryClient, QueryClientProvider, focusManager, onlineManager, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { getMobileRuntimeConfiguration } from "@/runtime-config";

const ApiContext = createContext<DaybookApiClient | null>(null);

export function AppProviders({ children }: PropsWithChildren) {
  const { getToken } = useAuth({ treatPendingAsSignedOut: false });
  const { apiOrigin } = getMobileRuntimeConfiguration();
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1, refetchOnReconnect: true },
      mutations: { retry: false },
    },
  }));
  const api = useMemo(
    () => new DaybookApiClient(apiOrigin, getToken, Crypto.randomUUID),
    [apiOrigin, getToken],
  );

  useEffect(() => onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected)))), []);
  useEffect(() => {
    const onChange = (status: AppStateStatus) => focusManager.setFocused(status === "active");
    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, []);

  return <ApiContext.Provider value={api}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></ApiContext.Provider>;
}

export function useApi() {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside AppProviders");
  return api;
}

export function useDaybookSession() {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const api = useApi();
  return useQuery({ queryKey: ["session"], queryFn: api.getSession, enabled: Boolean(isSignedIn) });
}
