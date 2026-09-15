import Ionicons from "@expo/vector-icons/Ionicons";
import { useClerk } from "@clerk/expo";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useState, type ComponentProps, type PropsWithChildren } from "react";
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import familyDaybookLogo from "../../../../public/family-daybook-logo.png";
import familyDaybookLogoDark from "../../assets/family-daybook-logo-dark.png";
import { AppearancePicker } from "@/components/appearance-picker";
import { InlineNotice, ScreenState } from "@/components/ui";
import { useAppTheme, useThemedStyles } from "@/mobile-theme";
import { useDaybookSession } from "@/providers";
import { spacing, type ThemeColors } from "@/theme";

type AppHref = "/" | "/timeline" | "/appointments" | "/incidents" | "/reports" | "/special-days" | "/settings" | "/reviewers" | "/subscription" | "/account";
type IconName = ComponentProps<typeof Ionicons>["name"];

type NavItem = {
  href: AppHref;
  label: string;
  icon: IconName;
  shortLabel?: string;
  visible?: boolean;
};

const primaryNavigation: NavItem[] = [
  { href: "/", label: "Today", icon: "checkmark-circle-outline" },
  { href: "/timeline", label: "Timeline", icon: "time-outline" },
  { href: "/appointments", label: "Appointments", shortLabel: "Appts", icon: "calendar-outline" },
  { href: "/incidents", label: "Incidents", icon: "warning-outline" },
  { href: "/reports", label: "Reports", icon: "document-text-outline" },
];

function routeIsActive(pathname: string, href: AppHref) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  const { resolvedTheme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityLabel="Family Daybook" accessibilityRole="header" style={styles.brand}>
      <Image alt="" resizeMode="contain" source={resolvedTheme === "dark" ? familyDaybookLogoDark : familyDaybookLogo} style={styles.brandLogo} />
    </View>
  );
}

function BottomNavigation({ canReadOpenDays }: { canReadOpenDays: boolean }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const pathname = usePathname();
  const router = useRouter();
  const items = primaryNavigation.filter((item) => item.href !== "/" || canReadOpenDays);
  return (
    <SafeAreaView edges={["bottom"]} style={styles.bottomSafeArea}>
      <View accessibilityRole="tablist" style={styles.bottomNavigation}>
        {items.map((item) => {
          const active = routeIsActive(pathname, item.href);
          const activeIcon = item.icon.replace("-outline", "") as IconName;
          return (
            <Pressable
              accessibilityLabel={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={item.href}
              onPress={() => { if (!active) router.replace(item.href); }}
              style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}
            >
              <Ionicons color={active ? colors.primary : colors.muted} name={active ? activeIcon : item.icon} size={21} />
              <Text numberOfLines={1} style={[styles.bottomLabel, active && styles.bottomLabelActive]}>{item.shortLabel ?? item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const clerk = useClerk();
  const pathname = usePathname();
  const router = useRouter();
  const session = useDaybookSession();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerProgress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!menuOpen) return;
    drawerProgress.setValue(0);
    Animated.timing(drawerProgress, {
      duration: 260,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [drawerProgress, menuOpen]);

  const closeMenu = () => {
    drawerProgress.stopAnimation();
    Animated.timing(drawerProgress, {
      duration: 210,
      toValue: 0,
      useNativeDriver: true,
    }).start(() => setMenuOpen(false));
  };

  if (!session.data) {
    return (
      <SafeAreaView style={styles.loadingSafeArea}>
        <ScreenState
          loading={session.isPending}
          error={session.error ?? new Error("We couldn’t load your Family Daybook session.")}
          onRetry={() => void session.refetch()}
        />
      </SafeAreaView>
    );
  }

  const secondaryNavigation: NavItem[] = [
    { href: "/special-days", label: "Special days", icon: "calendar-number-outline", visible: session.data.capabilities.manageSpecialDays },
    { href: "/settings", label: "Settings", icon: "settings-outline", visible: session.data.capabilities.manageSettings },
    { href: "/reviewers", label: "Reviewers", icon: "people-outline", visible: session.data.capabilities.manageReviewers },
    { href: "/subscription", label: "Plan & billing", icon: "card-outline" },
    { href: "/account", label: "Manage account", icon: "person-circle-outline" },
  ];
  const initial = session.data.user.displayName.trim().charAt(0).toUpperCase() || "F";
  const homeHref: AppHref = session.data.capabilities.readOpenDays ? "/" : "/timeline";

  return (
    <View style={styles.shell}>
      <SafeAreaView edges={["top"]} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Family Daybook home" onPress={() => router.replace(homeHref)} style={({ pressed }) => pressed && styles.pressed}>
            <Brand />
          </Pressable>
          <Pressable
            accessibilityLabel="Open navigation"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setMenuOpen(true)}
            style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
          >
            <Text style={styles.avatarText}>{initial}</Text>
            <Ionicons color={colors.ink} name="menu" size={20} />
          </Pressable>
        </View>
      </SafeAreaView>

      <View style={styles.content}>
        {session.error ? (
          <View style={styles.syncNotice}>
            <InlineNotice>Some account details could not be refreshed. Showing the most recently loaded information.</InlineNotice>
          </View>
        ) : null}
        {children}
      </View>
      <BottomNavigation canReadOpenDays={session.data.capabilities.readOpenDays} />

      <Modal animationType="none" onRequestClose={closeMenu} transparent visible={menuOpen}>
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.backdrop, { opacity: drawerProgress }]}>
            <Pressable accessibilityLabel="Close navigation" onPress={closeMenu} style={styles.backdropPressable} />
          </Animated.View>
          <Animated.View
            style={[styles.drawerFrame, {
              transform: [{
                translateX: drawerProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [340, 0],
                }),
              }],
            }]}
            testID="navigation-drawer"
          >
            <View
              style={[styles.drawer, { paddingBottom: insets.bottom, paddingTop: insets.top }]}
              testID="navigation-drawer-safe-area"
            >
              <View style={styles.drawerHeader}>
                <View>
                  <Text style={styles.drawerTitle}>Navigation</Text>
                  <Text numberOfLines={1} style={styles.drawerSubtitle}>{session.data.workspace.name}</Text>
                </View>
                <Pressable accessibilityLabel="Close navigation" hitSlop={8} onPress={closeMenu} style={styles.closeButton}>
                  <Ionicons color={colors.ink} name="close" size={22} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.drawerList}>
                {secondaryNavigation.filter((item) => item.visible !== false).map((item) => {
                  const active = routeIsActive(pathname, item.href);
                  return (
                    <Pressable
                      accessibilityRole="link"
                      key={item.href}
                      onPress={() => {
                        closeMenu();
                        if (!active) router.replace(item.href);
                      }}
                      style={({ pressed }) => [styles.drawerItem, active && styles.drawerItemActive, pressed && styles.pressed]}
                    >
                      <Ionicons color={active ? colors.primaryForeground : colors.primary} name={item.icon} size={21} />
                      <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>{item.label}</Text>
                      <Ionicons color={active ? colors.primaryForeground : colors.muted} name="chevron-forward" size={17} />
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.appearanceControl}>
                <Text style={styles.appearanceLabel}>Appearance</Text>
                <AppearancePicker compact />
              </View>

              <View style={styles.accountSummary}>
                <View style={styles.avatar}><Text style={styles.avatarSummaryText}>{initial}</Text></View>
                <View style={styles.accountCopy}>
                  <Text numberOfLines={1} style={styles.accountName}>{session.data.user.displayName}</Text>
                  <Text numberOfLines={1} style={styles.accountRole}>{session.data.member.role}</Text>
                </View>
                <Pressable accessibilityLabel="Sign out" onPress={() => void clerk.signOut()} style={styles.signOutButton}>
                  <Ionicons color={colors.muted} name="log-out-outline" size={21} />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  shell: { backgroundColor: colors.canvas, flex: 1 },
  loadingSafeArea: { backgroundColor: colors.canvas, flex: 1 },
  headerSafeArea: { backgroundColor: colors.header, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  header: { alignItems: "center", flexDirection: "row", height: 58, justifyContent: "space-between", paddingHorizontal: spacing.md },
  brand: { alignItems: "center", height: 42, justifyContent: "center", width: 178 },
  brandLogo: { height: 42, width: 178 },
  menuButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 44, paddingHorizontal: 8 },
  avatarText: { backgroundColor: colors.secondary, borderRadius: 14, color: colors.primary, fontSize: 13, fontWeight: "700", lineHeight: 28, overflow: "hidden", textAlign: "center", width: 28 },
  content: { flex: 1, minWidth: 0 },
  bottomSafeArea: { alignSelf: "stretch", backgroundColor: colors.navigation, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, width: "100%" },
  bottomNavigation: { alignItems: "stretch", alignSelf: "stretch", flexDirection: "row", height: 58, paddingHorizontal: 4, paddingTop: 4, width: "100%" },
  bottomItem: { alignItems: "center", flexBasis: 0, flexGrow: 1, gap: 1, justifyContent: "center", minHeight: 50, minWidth: 0, paddingHorizontal: 2 },
  bottomLabel: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  bottomLabelActive: { color: colors.primary },
  pressed: { opacity: 0.62 },
  modalRoot: { flex: 1, flexDirection: "row", justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  backdropPressable: { flex: 1 },
  drawerFrame: { maxWidth: 340, width: "84%" },
  drawer: { backgroundColor: colors.surface, flex: 1, paddingHorizontal: spacing.md },
  drawerHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: spacing.md, paddingTop: spacing.sm },
  drawerTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 27, fontWeight: "700" },
  drawerSubtitle: { color: colors.muted, fontSize: 13, marginTop: 3, maxWidth: 230 },
  closeButton: { alignItems: "center", backgroundColor: colors.mutedSurface, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  drawerList: { gap: spacing.xs, paddingVertical: spacing.lg },
  drawerItem: { alignItems: "center", borderRadius: 14, flexDirection: "row", gap: 12, minHeight: 50, paddingHorizontal: 14 },
  drawerItemActive: { backgroundColor: colors.primary },
  drawerItemText: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: "600" },
  drawerItemTextActive: { color: colors.primaryForeground },
  appearanceControl: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm, paddingVertical: spacing.md },
  appearanceLabel: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  accountSummary: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: 10, paddingVertical: spacing.md },
  avatar: { alignItems: "center", backgroundColor: colors.secondary, borderRadius: 19, height: 38, justifyContent: "center", width: 38 },
  avatarSummaryText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  accountRole: { color: colors.muted, fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  signOutButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  syncNotice: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
