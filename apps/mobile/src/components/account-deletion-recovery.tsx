import { useClerk, useUser } from "@clerk/expo";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";

import { ActionButton, Body, Card, Heading, Screen } from "@/components/ui";
import { useApi } from "@/providers";
import { colors } from "@/theme";
import { friendlyError } from "@/utils";

export function AccountDeletionRecovery({ autoStart = true }: { autoStart?: boolean }) {
  const api = useApi();
  const clerk = useClerk();
  const { user } = useUser();
  const [applicationDeleted, setApplicationDeleted] = useState(false);
  const identityDeleted = useRef(false);
  const autoStarted = useRef(false);

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
  const resumeApplicationDeletion = useMutation({
    mutationFn: () => api.deleteAccount({ confirmation: "DELETE MY ACCOUNT" }),
    onSuccess: (result) => {
      if (!result.applicationDataDeleted || !result.deleteClerkIdentity) {
        throw new Error("Account deletion did not complete safely.");
      }
      setApplicationDeleted(true);
      removeIdentity.mutate();
    },
  });
  const resume = resumeApplicationDeletion.mutate;

  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    resume();
  }, [autoStart, resume]);

  if (!applicationDeleted) {
    return (
      <Screen title="Finish deleting your account" subtitle="Family Daybook found an interrupted deletion and must finish private-data cleanup before removing your sign-in identity.">
        <Card>
          <Heading>Completing application cleanup</Heading>
          <Body>Keep this screen open. Your Clerk identity will only be removed after the server confirms application data cleanup.</Body>
          {resumeApplicationDeletion.error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{friendlyError(resumeApplicationDeletion.error)}</Text> : null}
          <ActionButton
            label={resumeApplicationDeletion.isPending ? "Finishing cleanup…" : "Retry cleanup"}
            danger
            disabled={resumeApplicationDeletion.isPending}
            onPress={() => resume()}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Finish deleting your account" subtitle="Your Family Daybook data has been removed.">
      <Card>
        <Heading>Removing Clerk identity</Heading>
        <Body>Keep this screen open until your sign-in identity is removed.</Body>
        {removeIdentity.error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{friendlyError(removeIdentity.error)}</Text> : null}
        <ActionButton
          label={removeIdentity.isPending ? "Deleting identity…" : "Retry identity deletion"}
          danger
          disabled={removeIdentity.isPending}
          onPress={() => removeIdentity.mutate()}
        />
      </Card>
    </Screen>
  );
}
