import { useClerk } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef } from "react";
import { Platform, Text } from "react-native";

import { ActionButton, Body, Card, Heading, InlineNotice, Screen, ScreenState } from "@/components/ui";
import { useAppTheme } from "@/mobile-theme";
import { useApi, useDaybookSession } from "@/providers";
import { friendlyError } from "@/utils";
import { getGoogleExternalTransactionToken, launchGoogleExternalLink } from "@/native/external-links";
import { billingLinkInputForPlatform, isBillingCompletionUrl, launchCheckoutForPlatform } from "@/billing-handoff";

export default function SubscriptionScreen() {
  const { colors } = useAppTheme();
  const api = useApi();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const session = useDaybookSession();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const billing = useQuery({
    queryKey: ["clerk-billing-summary"],
    queryFn: async () => {
      const [plans, statements] = await Promise.all([clerk.billing.getPlans({ for: "user" }), clerk.billing.getStatements({ pageSize: 3 })]);
      return { plans: (plans as { data?: unknown[] }).data?.length ?? 0, statements: (statements as { data?: unknown[] }).data?.length ?? 0 };
    },
    retry: false,
  });
  const stopPolling = () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; };
  useEffect(() => stopPolling, []);
  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (!isBillingCompletionUrl(url)) return;
      stopPolling();
      if (Platform.OS === "ios") void WebBrowser.dismissBrowser().catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ["session"] });
    });
    return () => subscription.remove();
  }, [queryClient]);
  const checkout = useMutation({ mutationFn: async () => {
    const platform = Platform.OS === "android" ? "android" : "ios";
    const input = await billingLinkInputForPlatform(platform, getGoogleExternalTransactionToken);
    const intent = await api.createBillingLinkIntent(input);
    await launchCheckoutForPlatform(platform, intent.checkoutUrl, {
      openIosBrowser: (url) => WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET }),
      launchAndroidExternalLink: launchGoogleExternalLink,
    });
    const started = Date.now();
    stopPolling();
    pollRef.current = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["session"] });
      if (Date.now() - started >= 30_000) stopPolling();
    }, 2_000);
  } });
  const value = session.data?.billing;
  return (
    <Screen title="Subscription" subtitle="Your purchase is completed securely on the Family Daybook website.">
      {value ? <Card><Heading>{value.status === "active" ? "Access active" : value.status === "unavailable" ? "Billing unavailable" : "Subscription required"}</Heading><Body>Status: {value.status.replace("_", " ")}</Body>{value.status === "active" ? <Body>Source: {value.source}</Body> : null}</Card> : <ScreenState loading />}
      {billing.data ? <Card><Heading>Clerk billing</Heading><Body>{billing.data.plans} available plan{billing.data.plans === 1 ? "" : "s"}</Body><Body>{billing.data.statements} recent statement{billing.data.statements === 1 ? "" : "s"}</Body></Card> : null}
      {billing.error ? <InlineNotice>Billing history is temporarily unavailable. Your server-verified access status above remains authoritative.</InlineNotice> : null}
      {value?.status === "subscription_required" ? <ActionButton label={checkout.isPending ? "Opening website…" : "Choose a plan on the web"} disabled={checkout.isPending} onPress={() => checkout.mutate()} /> : <ActionButton label="Refresh status" secondary onPress={() => void session.refetch()} />}
      {checkout.error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{friendlyError(checkout.error)}</Text> : null}
      <Body muted>No payment is processed by this app, Apple, or Google. Closing the website does not change your plan.</Body>
    </Screen>
  );
}
