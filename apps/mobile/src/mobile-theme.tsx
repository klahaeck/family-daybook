import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Appearance, useColorScheme } from "react-native";

import { darkColors, lightColors, type ThemeColors } from "@/theme";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

const THEME_PREFERENCE_KEY = "family-daybook.appearance";

type MobileThemeValue = {
  colors: ThemeColors;
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const MobileThemeContext = createContext<MobileThemeValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = SecureStore.getItem(THEME_PREFERENCE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function MobileThemeProvider({ children }: PropsWithChildren) {
  const systemTheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const resolvedTheme: ResolvedTheme = preference === "system"
    ? systemTheme === "dark" ? "dark" : "light"
    : preference;
  const colors = resolvedTheme === "dark" ? darkColors : lightColors;

  useEffect(() => {
    Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
  }, [preference]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    void SecureStore.setItemAsync(THEME_PREFERENCE_KEY, nextPreference).catch(() => undefined);
  }, []);

  const value = useMemo<MobileThemeValue>(() => ({
    colors,
    preference,
    resolvedTheme,
    setPreference,
  }), [colors, preference, resolvedTheme, setPreference]);

  return <MobileThemeContext.Provider value={value}>{children}</MobileThemeContext.Provider>;
}

export function useAppTheme() {
  const theme = useContext(MobileThemeContext);
  if (!theme) throw new Error("useAppTheme must be used inside MobileThemeProvider");
  return theme;
}

export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useAppTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
