import { useSession } from "@clerk/expo";
import { AuthView } from "@clerk/expo/native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useThemedStyles } from "@/mobile-theme";
import type { ThemeColors } from "@/theme";

export default function SignInScreen() {
  const { session } = useSession();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  useEffect(() => {
    if (session?.status === "active") router.replace("/");
  }, [router, session?.status]);
  return (
    <SafeAreaView style={styles.container}>
      <AuthView isDismissible={false} />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({ container: { flex: 1, backgroundColor: colors.canvas } });
