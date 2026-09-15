import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { Redirect } from "expo-router";

import { ScreenState } from "@/components/ui";
import { AccountDeletionRecovery } from "@/components/account-deletion-recovery";
import { useDaybookSession } from "@/providers";
import { isAccountDeletionInProgress, mobileMaintenanceMessage, mobileUpdateRequiredMessage, versionAtLeast } from "@/utils";

export default function Index() {
  const auth = useAuth({ treatPendingAsSignedOut: false });
  const session = useDaybookSession();
  if (!auth.isLoaded) return <ScreenState loading />;
  if (!auth.isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (session.isPending) return <ScreenState loading />;
  if (isAccountDeletionInProgress(session.error)) return <AccountDeletionRecovery />;
  if (session.error) return <ScreenState error={session.error} onRetry={() => void session.refetch()} />;
  if (session.data?.maintenance) return <ScreenState error={new Error(mobileMaintenanceMessage)} onRetry={() => void session.refetch()} />;
  if (session.data && !versionAtLeast(Constants.expoConfig?.version ?? "0.0.0", session.data.minimumSupportedVersion)) return <ScreenState error={new Error(mobileUpdateRequiredMessage)} />;
  if (session.data?.billing.status !== "active") return <Redirect href="/(app)/subscription" />;
  return <Redirect href="/(app)" />;
}
