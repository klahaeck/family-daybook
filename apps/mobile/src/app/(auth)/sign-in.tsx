import { useSession } from "@clerk/expo";
import { AuthView } from "@clerk/expo/native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { SafeAreaView, StyleSheet } from "react-native";

import { colors } from "@/theme";

export default function SignInScreen() {
  const { session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session?.status === "active") router.replace("/");
  }, [router, session?.status]);
  return (
    <SafeAreaView style={styles.container}>
      <AuthView isDismissible={false} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.canvas } });
