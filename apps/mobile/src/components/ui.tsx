import { Link } from "expo-router";
import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";

import { colors, spacing } from "@/theme";
import { friendlyError } from "@/utils";

export function Screen({ children, title, subtitle }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={styles.screen} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </ScrollView>
  );
}

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export function Heading({ children }: PropsWithChildren) {
  return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>;
}

export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  error?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        autoCapitalize={props.autoCapitalize}
        keyboardType={props.keyboardType}
        multiline={props.multiline}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, props.multiline && styles.textarea, props.error && styles.inputError]}
        value={props.value}
      />
      {props.error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{props.error}</Text> : null}
    </View>
  );
}

export function ActionButton({ label, onPress, disabled, danger = false, secondary = false }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, danger && styles.buttonDanger, (pressed || disabled) && styles.buttonDim]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={styles.choiceText}>{selected ? "✓ " : ""}{label}</Text>
    </Pressable>
  );
}

export function ScreenState({ loading, error, empty, onRetry }: { loading?: boolean; error?: unknown; empty?: string; onRetry?: () => void }) {
  if (loading) return <View style={styles.state}><ActivityIndicator color={colors.primary} /><Body muted>Loading…</Body></View>;
  if (error) return <View accessibilityLiveRegion="polite" style={styles.state}><Text style={styles.errorText}>{friendlyError(error)}</Text>{onRetry ? <ActionButton label="Try again" onPress={onRetry} secondary /> : null}</View>;
  if (empty) return <Body muted>{empty}</Body>;
  return null;
}

type AppHref = "/" | "/timeline" | "/appointments" | "/incidents" | "/special-days" | "/reports" | "/settings" | "/reviewers" | "/subscription" | "/account";

export function AppNavigation({ canReadOpenDays, canManageSettings, canManageReviewers }: { canReadOpenDays: boolean; canManageSettings: boolean; canManageReviewers: boolean }) {
  const items: Array<[string, AppHref, boolean]> = [
    ["Today", "/", canReadOpenDays], ["Timeline", "/timeline", true], ["Appointments", "/appointments", true],
    ["Incidents", "/incidents", true], ["Special days", "/special-days", true], ["Reports", "/reports", true],
    ["Settings", "/settings", canManageSettings], ["Reviewers", "/reviewers", canManageReviewers],
    ["Subscription", "/subscription", true], ["Account", "/account", true],
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nav} accessibilityRole="tablist">
      {items.filter((item) => item[2]).map(([label, href]) => (
        <Link key={href} href={href} asChild><Pressable accessibilityRole="link" style={styles.navItem}><Text style={styles.navText}>{label}</Text></Pressable></Link>
      ))}
    </ScrollView>
  );
}

export function InlineNotice({ children }: { children: ReactNode }) {
  return <View accessibilityLiveRegion="polite" style={styles.notice}><Body>{children}</Body></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.md, paddingBottom: 64, gap: spacing.md },
  title: { color: colors.ink, fontSize: 30, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: spacing.md, gap: spacing.md },
  heading: { color: colors.ink, fontSize: 19, fontWeight: "700" },
  body: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  muted: { color: colors.muted },
  field: { gap: spacing.xs },
  label: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  input: { minHeight: 48, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.ink, fontSize: 16, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface },
  textarea: { minHeight: 96, textAlignVertical: "top" },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 14 },
  button: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 10, minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
  buttonSecondary: { backgroundColor: colors.accent },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDim: { opacity: 0.6 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  buttonSecondaryText: { color: colors.ink },
  choice: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  choiceSelected: { backgroundColor: colors.accent, borderColor: colors.primary },
  choiceText: { color: colors.ink, fontSize: 15 },
  state: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  nav: { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  navItem: { backgroundColor: colors.accent, borderRadius: 18, justifyContent: "center", minHeight: 36, paddingHorizontal: 13 },
  navText: { color: colors.ink, fontWeight: "600" },
  notice: { backgroundColor: "#FFF5D9", borderRadius: 10, padding: 12 },
});
