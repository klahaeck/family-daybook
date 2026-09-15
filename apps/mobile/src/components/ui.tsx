import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";

import { useAppTheme, useThemedStyles } from "@/mobile-theme";
import { spacing, type ThemeColors } from "@/theme";
import { friendlyError } from "@/utils";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function Screen({ children, title, subtitle, eyebrow }: PropsWithChildren<{ title: string; subtitle?: string; eyebrow?: string }>) {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
    >
      <View style={styles.pageHeading}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({ children, accent = false, dashed = false }: PropsWithChildren<{ accent?: boolean; dashed?: boolean }>) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.card, accent && styles.cardAccent, dashed && styles.cardDashed]}>{children}</View>;
}

export function Heading({ children }: PropsWithChildren) {
  const styles = useThemedStyles(createStyles);
  return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>;
}

export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  const styles = useThemedStyles(createStyles);
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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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

export function ActionButton({ label, onPress, disabled, danger = false, secondary = false, compact = false, icon }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  secondary?: boolean;
  compact?: boolean;
  icon?: IconName;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        compact && styles.buttonCompact,
        (pressed || disabled) && styles.buttonDim,
      ]}
    >
      {icon ? <Ionicons color={secondary ? colors.primary : colors.primaryForeground} name={icon} size={17} /> : null}
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ label, icon, onPress, disabled }: { label: string; icon: IconName; onPress: () => void; disabled?: boolean }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, (pressed || disabled) && styles.buttonDim]}
    >
      <Ionicons color={colors.primary} name={icon} size={20} />
    </Pressable>
  );
}

export function ChoiceRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.buttonDim]}
    >
      <Ionicons color={selected ? colors.primary : colors.muted} name={selected ? "checkmark-circle" : "ellipse-outline"} size={20} />
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ children, danger = false }: PropsWithChildren<{ danger?: boolean }>) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.badge, danger && styles.badgeDanger]}><Text style={[styles.badgeText, danger && styles.badgeDangerText]}>{children}</Text></View>;
}

export function ProgressBar({ value }: { value: number }) {
  const styles = useThemedStyles(createStyles);
  const safeValue = Math.max(0, Math.min(100, value));
  return <View accessibilityLabel={`${safeValue}% complete`} accessibilityRole="progressbar" style={styles.progressTrack}><View style={[styles.progressValue, { width: `${safeValue}%` }]} /></View>;
}

export function ScreenState({ loading, error, empty, onRetry }: { loading?: boolean; error?: unknown; empty?: string; onRetry?: () => void }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  if (loading) return <View style={styles.state}><ActivityIndicator color={colors.primary} /><Body muted>Loading…</Body></View>;
  if (error) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.errorCard}>
        <View style={styles.errorHeading}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={22} />
          <Text style={styles.errorTitle}>We couldn’t load this content</Text>
        </View>
        <Text style={styles.errorBody}>{friendlyError(error)}</Text>
        {onRetry ? <ActionButton compact label="Try again" onPress={onRetry} secondary /> : null}
      </View>
    );
  }
  if (empty) return <View style={styles.emptyState}><Ionicons color={colors.muted} name="leaf-outline" size={25} /><Body muted>{empty}</Body></View>;
  return null;
}

export function InlineNotice({ children, tone = "warning" }: PropsWithChildren<{ tone?: "warning" | "info" | "success" }>) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const icon: IconName = tone === "success" ? "checkmark-circle-outline" : tone === "info" ? "information-circle-outline" : "time-outline";
  return (
    <View accessibilityLiveRegion="polite" style={[styles.notice, tone === "info" && styles.noticeInfo, tone === "success" && styles.noticeSuccess]}>
      <Ionicons color={tone === "warning" ? colors.warning : colors.primary} name={icon} size={19} />
      <View style={styles.noticeText}><Body>{children}</Body></View>
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.row}>{children}</View>;
}

const serifFont = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  content: { alignSelf: "center", gap: 20, maxWidth: 1080, paddingBottom: spacing.xl, paddingHorizontal: spacing.md, paddingTop: spacing.lg, width: "100%" },
  pageHeading: { gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "700", letterSpacing: 1.7, textTransform: "uppercase" },
  title: { color: colors.ink, fontFamily: serifFont, fontSize: 32, fontWeight: "700", letterSpacing: -0.7, lineHeight: 39 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, maxWidth: 680 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    gap: 12,
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  cardAccent: { backgroundColor: colors.secondary, borderColor: colors.brandSoft },
  cardDashed: { borderStyle: "dashed", elevation: 0, shadowOpacity: 0 },
  heading: { color: colors.ink, fontFamily: serifFont, fontSize: 19, fontWeight: "700", lineHeight: 24 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted },
  field: { gap: spacing.xs },
  label: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  input: { minHeight: 48, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.ink, fontSize: 16, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: colors.surface },
  textarea: { minHeight: 104, textAlignVertical: "top" },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  button: { alignItems: "center", backgroundColor: colors.primary, borderColor: colors.primary, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
  buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.border },
  buttonDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  buttonCompact: { alignSelf: "flex-start", minHeight: 42, paddingHorizontal: 14 },
  buttonDim: { opacity: 0.55 },
  buttonText: { color: colors.primaryForeground, fontSize: 15, fontWeight: "700" },
  buttonSecondaryText: { color: colors.primary },
  iconButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 46, justifyContent: "center", width: 46 },
  choice: { alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 46, paddingHorizontal: 12 },
  choiceSelected: { backgroundColor: colors.secondary, borderColor: colors.brandSoft },
  choiceText: { color: colors.ink, flex: 1, fontSize: 15, textTransform: "capitalize" },
  choiceTextSelected: { color: colors.primary, fontWeight: "600" },
  badge: { alignSelf: "flex-start", backgroundColor: colors.secondary, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeDanger: { backgroundColor: colors.dangerSurface },
  badgeText: { color: colors.primary, fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  badgeDangerText: { color: colors.danger },
  progressTrack: { backgroundColor: colors.primaryTrack, borderRadius: 999, height: 8, overflow: "hidden", width: "100%" },
  progressValue: { backgroundColor: colors.primaryForeground, borderRadius: 999, height: "100%" },
  state: { alignItems: "center", gap: spacing.sm, justifyContent: "center", minHeight: 120, paddingVertical: spacing.lg },
  errorCard: { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder, borderRadius: 16, borderWidth: 1, gap: 10, padding: spacing.md },
  errorHeading: { alignItems: "center", flexDirection: "row", gap: 8 },
  errorTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 17, fontWeight: "700" },
  errorBody: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  emptyState: { alignItems: "center", backgroundColor: colors.mutedSurface, borderRadius: 16, gap: 8, padding: spacing.lg },
  notice: { alignItems: "flex-start", backgroundColor: colors.warningSurface, borderColor: colors.warningBorder, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, padding: 13 },
  noticeInfo: { backgroundColor: colors.mutedSurface, borderColor: colors.border },
  noticeSuccess: { backgroundColor: colors.secondary, borderColor: colors.brandSoft },
  noticeText: { flex: 1 },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
});
