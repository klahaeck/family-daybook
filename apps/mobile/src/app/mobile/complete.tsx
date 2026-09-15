import { Redirect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { Platform } from "react-native";

import { ScreenState } from "@/components/ui";
import { useDaybookSession } from "@/providers";

export default function MobileCheckoutComplete() {
  const session = useDaybookSession();
  const { refetch } = session;

  useEffect(() => {
    if (Platform.OS === "ios") void WebBrowser.dismissBrowser().catch(() => undefined);
    void refetch();
  }, [refetch]);

  if (session.isFetching) return <ScreenState loading />;
  return <Redirect href={session.data?.billing.status === "active" ? "/(app)" : "/(app)/subscription"} />;
}
