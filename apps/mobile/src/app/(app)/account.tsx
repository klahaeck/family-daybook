import { useClerk, useUser } from "@clerk/expo";
import { UserProfileView } from "@clerk/expo/native";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Alert, Image, Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActionButton, Body, Card, Heading, Screen } from "@/components/ui";
import { useAppTheme, useThemedStyles } from "@/mobile-theme";
import { useApi, useDaybookSession } from "@/providers";
import type { ThemeColors } from "@/theme";
import { friendlyError } from "@/utils";

export default function AccountScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const api = useApi();
  const clerk = useClerk();
  const { user } = useUser();
  const session = useDaybookSession();
  const [applicationDeleted, setApplicationDeleted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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
    <Screen eyebrow="Your account" title="Account" subtitle="Manage your Clerk identity and Family Daybook access.">
      <Card>
        <View style={styles.profileRow}>
          {user?.imageUrl ? <Image accessibilityLabel="Profile photo" alt="Profile photo" source={{ uri: user.imageUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{session.data?.user.displayName.charAt(0).toUpperCase() || "F"}</Text></View>}
          <View style={styles.profileCopy}>
            <Heading>{session.data?.user.displayName ?? "Family Daybook member"}</Heading>
            <Body muted>{user?.primaryEmailAddress?.emailAddress ?? session.data?.user.email}</Body>
          </View>
        </View>
        <ActionButton label="Edit profile and security" secondary onPress={() => setProfileOpen(true)} />
      </Card>
      <Card><Heading>Sign out</Heading><ActionButton label="Sign out" secondary onPress={() => void clerk.signOut()} /></Card>
      <Card><Heading>Delete account</Heading><Body>{session.data?.member.role === "owner" ? "This permanently deletes the workspace and its private records before removing your identity." : "This removes your reviewer membership and identity without deleting the owner's workspace."}</Body><ActionButton label={remove.isPending ? "Deleting…" : "Delete my account"} danger disabled={remove.isPending} onPress={() => Alert.alert("Delete your account?", "This cannot be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove.mutate() }])} />{remove.error ? <Text style={{ color: colors.danger }}>{friendlyError(remove.error)}</Text> : null}</Card>
      <Modal animationType="slide" onRequestClose={() => setProfileOpen(false)} presentationStyle="pageSheet" visible={profileOpen}>
        <SafeAreaView edges={["top", "bottom"]} style={styles.profileSheet}>
          <UserProfileView isDismissible onDismiss={() => setProfileOpen(false)} style={styles.profileView} />
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  profileRow: { alignItems: "center", flexDirection: "row", gap: 14 },
  avatar: { borderRadius: 28, height: 56, width: 56 },
  avatarFallback: { alignItems: "center", backgroundColor: colors.secondary, borderRadius: 28, height: 56, justifyContent: "center", width: 56 },
  avatarInitial: { color: colors.primary, fontSize: 21, fontWeight: "700" },
  profileCopy: { flex: 1, gap: 2, minWidth: 0 },
  profileSheet: { backgroundColor: colors.canvas, flex: 1 },
  profileView: { flex: 1 },
});
