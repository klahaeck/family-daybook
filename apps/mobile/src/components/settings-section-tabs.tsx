import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme, useThemedStyles } from "@/mobile-theme";
import type { ThemeColors } from "@/theme";

export type SettingsSection = "family" | "routine" | "access";

type IconName = ComponentProps<typeof Ionicons>["name"];

const sections: Array<{ value: SettingsSection; label: string; icon: IconName }> = [
  { value: "family", label: "Family", icon: "home-outline" },
  { value: "routine", label: "Routine", icon: "list-outline" },
  { value: "access", label: "Access", icon: "people-outline" },
];

export function SettingsSectionTabs({ value, onChange }: {
  value: SettingsSection;
  onChange: (value: SettingsSection) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityLabel="Settings sections" accessibilityRole="tablist" style={styles.tabs}>
      {sections.map((section) => {
        const selected = section.value === value;
        return (
          <Pressable
            accessibilityLabel={section.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={section.value}
            onPress={() => onChange(section.value)}
            style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.tabPressed]}
          >
            <Ionicons color={selected ? colors.primaryForeground : colors.muted} name={section.icon} size={18} />
            <Text style={[styles.label, selected && styles.labelSelected]}>{section.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  tabs: {
    alignItems: "stretch",
    backgroundColor: colors.mutedSurface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4,
    width: "100%",
  },
  tab: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  tabSelected: { backgroundColor: colors.primary },
  tabPressed: { opacity: 0.65 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  labelSelected: { color: colors.primaryForeground },
});
