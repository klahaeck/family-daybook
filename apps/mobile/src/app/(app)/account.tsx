import { useClerk, useUser } from "@clerk/expo";
import { UserProfileView } from "@clerk/expo/native";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Alert, Text, View } from "react-native";

import { ActionButton, Body, Card, Heading, Screen } from "@/components/ui";
import { useApi, useDaybookSession } from "@/providers";
import { colors } from "@/theme";
import { friendlyError } from "@/utils";

export default function AccountScreen() {
  const api = useApi();
  const clerk = useClerk();
  const { user } = useUser();
  const session = useDaybookSession();
  const [applicationDeleted, setApplicationDeleted] = useState(false);
  const identityDeleted = useRef(false);
  const removeIdentity = useMutation({
    mutationFn: async () => {
      if (!identityDeleted.current) {
        if (!user) throw new Error("Your Clerk profile is not available yet.");
        await user.delete();
        identityDeleted.current = true;
      }
      await clerk.signOut();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAccount({ confirmation: "DELETE MY ACCOUNT" }),
    onSuccess: async (result) => {
      if (!result.applicationDataDeleted || !result.deleteClerkIdentity) throw new Error("Account deletion did not complete safely.");
      setApplicationDeleted(true);
      removeIdentity.mutate();
    },
  });
  if (applicationDeleted) {
    return <Screen title="Finish deleting your account" subtitle="Your Family Daybook data has been removed."><Card><Heading>Clerk identity deletion required</Heading><Body>Stay on this screen until your sign-in identity is removed.</Body>{removeIdentity.error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{friendlyError(removeIdentity.error)}</Text> : null}<ActionButton label={removeIdentity.isPending ? "Deleting identity…" : "Retry identity deletion"} danger disabled={removeIdentity.isPending} onPress={() => removeIdentity.mutate()} /></Card></Screen>;
  }
  return (
    <Screen title="Account" subtitle="Manage your Clerk identity and Family Daybook access.">
      <Card><Heading>Profile</Heading><View style={{ minHeight: 440 }}><UserProfileView /></View></Card>
      <Card><Heading>Sign out</Heading><ActionButton label="Sign out" secondary onPress={() => void clerk.signOut()} /></Card>
      <Card><Heading>Delete account</Heading><Body>{session.data?.member.role === "owner" ? "This permanently deletes the workspace and its private records before removing your identity." : "This removes your reviewer membership and identity without deleting the owner's workspace."}</Body><ActionButton label={remove.isPending ? "Deleting…" : "Delete my account"} danger disabled={remove.isPending} onPress={() => Alert.alert("Delete your account?", "This cannot be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove.mutate() }])} />{remove.error ? <Text style={{ color: colors.danger }}>{friendlyError(remove.error)}</Text> : null}</Card>
    </Screen>
  );
}
