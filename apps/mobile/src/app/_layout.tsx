import { ClerkProvider, useAuth, useSession } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { AuthView } from "@clerk/expo/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Modal, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenState } from "@/components/ui";
import { AppProviders } from "@/providers";
import { colors } from "@/theme";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) throw new Error("Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY before starting the mobile app.");

function RootNavigator() {
  const auth = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded: isSessionLoaded, session } = useSession();
  const isAuthFlowComplete = auth.isLoaded
    && isSessionLoaded
    && auth.isSignedIn
    && session?.status === "active";
  const showAuth = auth.isLoaded && isSessionLoaded && !isAuthFlowComplete;

  return (
    <>
      {isAuthFlowComplete ? (
        <AppProviders>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerBackTitle: "Back", headerTitle: "Family Daybook" }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
            <Stack.Screen name="mobile/complete" options={{ headerShown: false }} />
          </Stack>
        </AppProviders>
      ) : <ScreenState loading={!showAuth} />}
      <Modal
        animationType="slide"
        presentationStyle="fullScreen"
        visible={showAuth}
        onRequestClose={() => undefined}
      >
        <SafeAreaView style={styles.auth}>
          <AuthView isDismissible={false} />
        </SafeAreaView>
      </Modal>
    </>
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <RootNavigator />
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({ auth: { flex: 1, backgroundColor: colors.canvas } });
