import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { Redirect, Stack, usePathname } from "expo-router";

import { AppShell } from "@/components/app-shell";
import { AccountDeletionRecovery } from "@/components/account-deletion-recovery";
import { ScreenState } from "@/components/ui";
import { useDaybookSession } from "@/providers";
import { isAccountDeletionInProgress, mobileMaintenanceMessage, mobileUpdateRequiredMessage, versionAtLeast } from "@/utils";

export default function AppLayout() {
  const auth = useAuth({ treatPendingAsSignedOut: false });
  const session = useDaybookSession();
  const pathname = usePathname();
  if (!auth.isLoaded) return <ScreenState loading />;
  if (!auth.isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (session.isPending && !session.data) return <ScreenState loading />;
  if (isAccountDeletionInProgress(session.error)) return <AccountDeletionRecovery />;
  if (!session.data) return <ScreenState error={session.error ?? new Error("We couldn’t load your Family Daybook session.")} onRetry={() => void session.refetch()} />;
  if (session.data.maintenance) return <ScreenState error={new Error(mobileMaintenanceMessage)} onRetry={() => void session.refetch()} />;
  if (!versionAtLeast(Constants.expoConfig?.version ?? "0.0.0", session.data.minimumSupportedVersion)) return <ScreenState error={new Error(mobileUpdateRequiredMessage)} />;
  if (session.data.billing.status !== "active" && pathname !== "/subscription") return <Redirect href="/(app)/subscription" />;
  return <AppShell><Stack screenOptions={{ headerShown: false }} /></AppShell>;
}
