import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Text } from "react-native";

import { ActionButton, Body, Card, Field, Heading, InlineNotice, Screen, ScreenState } from "@/components/ui";
import { useApi, useDaybookSession } from "@/providers";
import { colors } from "@/theme";
import { friendlyError } from "@/utils";

export default function ReviewersScreen() {
  const api = useApi();
  const queryClient = useQueryClient();
  const session = useDaybookSession();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings, enabled: Boolean(session.data?.capabilities.manageReviewers) });
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["settings"] });
  const invite = useMutation({ mutationFn: () => api.inviteReviewer({ email, displayName }), onSuccess: async () => { setEmail(""); setDisplayName(""); await refresh(); } });
  const revoke = useMutation({ mutationFn: (id: string) => api.revokeReviewer(id), onSuccess: refresh });
  if (!session.data?.capabilities.manageReviewers) return <Screen title="Reviewers"><InlineNotice>Only workspace owners can manage reviewer access.</InlineNotice></Screen>;
  return (
    <Screen title="Reviewers" subtitle="Invite read-only access to finalized history.">
      <Card><Heading>Invite reviewer</Heading><Field label="Name" value={displayName} onChangeText={setDisplayName} /><Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />{invite.error ? <Text style={{ color: colors.danger }}>{friendlyError(invite.error)}</Text> : null}<ActionButton label={invite.isPending ? "Inviting…" : "Send invitation"} disabled={invite.isPending || !email.includes("@") || displayName.trim().length < 2} onPress={() => invite.mutate()} /></Card>
      <ScreenState loading={settings.isPending} error={settings.error} onRetry={() => void settings.refetch()} empty={settings.data?.members.filter((member) => member.role === "reviewer").length === 0 ? "No reviewers yet." : undefined} />
      {settings.data?.members.filter((member) => member.role === "reviewer").map((reviewer) => <Card key={reviewer.id}><Heading>{reviewer.displayName}</Heading><Body>{reviewer.email}</Body><Body muted>{reviewer.status}</Body>{reviewer.status !== "revoked" ? <ActionButton label="Revoke access" danger onPress={() => Alert.alert("Revoke reviewer?", `${reviewer.displayName} will immediately lose access.`, [{ text: "Cancel", style: "cancel" }, { text: "Revoke", style: "destructive", onPress: () => revoke.mutate(reviewer.id) }])} /> : null}</Card>)}
    </Screen>
  );
}
