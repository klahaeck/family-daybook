import type { PropsWithChildren } from "react";
import { View } from "react-native";

import { AppNavigation, ScreenState } from "@/components/ui";
import { useDaybookSession } from "@/providers";

export function AppShell({ children }: PropsWithChildren) {
  const session = useDaybookSession();
  if (session.isPending || session.error || !session.data) {
    return <ScreenState loading={session.isPending} error={session.error} onRetry={() => void session.refetch()} />;
  }
  return (
    <View style={{ flex: 1 }}>
      <AppNavigation canReadOpenDays={session.data.capabilities.readOpenDays} canManageSettings={session.data.capabilities.manageSettings} canManageReviewers={session.data.capabilities.manageReviewers} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
