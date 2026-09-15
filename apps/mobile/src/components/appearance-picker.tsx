import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme, useThemedStyles, type ThemePreference } from "@/mobile-theme";
import type { ThemeColors } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const options: Array<{ value: ThemePreference; label: string; icon: IconName }> = [
  { value: "system", label: "System", icon: "phone-portrait-outline" },
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
];

export function AppearancePicker({ compact = false }: { compact?: boolean }) {
  const { colors, preference, setPreference } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View accessibilityLabel="Appearance" accessibilityRole="radiogroup" style={styles.options}>
      {options.map((option) => {
        const selected = preference === option.value;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            key={option.value}
            onPress={() => setPreference(option.value)}
            style={({ pressed }) => [
              styles.option,
              compact && styles.optionCompact,
              selected && styles.optionSelected,
              pressed && styles.optionPressed,
            ]}
          >
            <Ionicons color={selected ? colors.primary : colors.muted} name={option.icon} size={compact ? 16 : 19} />
            <Text numberOfLines={1} style={[styles.label, compact && styles.labelCompact, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  options: { flexDirection: "row", gap: 8, width: "100%" },
  option: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    gap: 7,
    justifyContent: "center",
    minHeight: 66,
    minWidth: 0,
    paddingHorizontal: 6,
  },
  optionCompact: { flexDirection: "row", gap: 5, minHeight: 42 },
  optionSelected: { backgroundColor: colors.secondary, borderColor: colors.brandSoft },
  optionPressed: { opacity: 0.65 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  labelCompact: { fontSize: 11 },
  labelSelected: { color: colors.primary },
});
