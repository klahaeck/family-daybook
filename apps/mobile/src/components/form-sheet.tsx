import type { PropsWithChildren } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconButton } from "@/components/ui";
import { useThemedStyles } from "@/mobile-theme";
import { spacing, type ThemeColors } from "@/theme";

export function FormSheet({ children, title, visible, onClose }: PropsWithChildren<{ title: string; visible: boolean; onClose: () => void }>) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.sheetSafeArea}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  sheetSafeArea: { backgroundColor: colors.canvas, flex: 1 },
  sheetHeader: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 64, paddingHorizontal: spacing.md },
  sheetTitle: { color: colors.ink, flex: 1, fontFamily: "Georgia", fontSize: 23, fontWeight: "700" },
  sheetContent: { gap: 14, padding: spacing.md, paddingBottom: spacing.xl },
});
