import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { ReactTestInstance } from "react-test-renderer";
import { Image, Modal, ScrollView, StyleSheet, Text } from "react-native";

import familyDaybookLogo from "../../../../public/family-daybook-logo.png";
import familyDaybookLogoDark from "../../assets/family-daybook-logo-dark.png";
import { AppShell } from "./app-shell";

const mockSignOut = jest.fn();
const mockReplace = jest.fn();
const mockUseDaybookSession = jest.fn();
const mockSetThemePreference = jest.fn();
let mockResolvedTheme: "light" | "dark" = "light";

jest.mock("@/mobile-theme", () => {
  const { darkColors, lightColors } = jest.requireActual<typeof import("@/theme")>("@/theme");
  const currentColors = () => mockResolvedTheme === "dark" ? darkColors : lightColors;
  return {
    useAppTheme: () => ({
      colors: currentColors(),
      preference: "system",
      resolvedTheme: mockResolvedTheme,
      setPreference: mockSetThemePreference,
    }),
    useThemedStyles: <T,>(factory: (colors: typeof lightColors) => T): T => factory(currentColors()),
  };
});

function sessionResult(readOpenDays = true) {
  return {
    data: {
      user: { id: "user_1", displayName: "Taylor Parent", email: "taylor@example.test" },
      workspace: { id: "workspace_1", name: "Taylor family", timezone: "America/Chicago" },
      member: { id: "member_1", role: readOpenDays ? "owner" : "reviewer", status: "active" },
      currentLocalDate: "2026-09-15",
      capabilities: {
        readRecords: true,
        readOpenDays,
        mutateRecords: readOpenDays,
        finalizeDays: readOpenDays,
        manageSpecialDays: readOpenDays,
        manageSettings: readOpenDays,
        manageReviewers: readOpenDays,
        hardPurge: false,
        subscribe: readOpenDays,
      },
      billing: { status: "active", source: "subscription" },
      minimumSupportedVersion: "0.1.0",
      maintenance: false,
    },
    error: null,
    isPending: false,
    refetch: jest.fn(),
  };
}

jest.mock("@clerk/expo", () => ({
  useClerk: () => ({ signOut: mockSignOut }),
}));

jest.mock("expo-router", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("react-native-safe-area-context", () => {
  const { View: MockView } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SafeAreaView: ({ children, ...props }: { children: ReactNode }) => <MockView {...props}>{children}</MockView>,
    useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
  };
});

jest.mock("@expo/vector-icons/Ionicons", () => {
  const { Text: MockText } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <MockText>{name}</MockText>,
  };
});

jest.mock("@/providers", () => ({
  useDaybookSession: () => mockUseDaybookSession(),
}));

describe("AppShell", () => {
  beforeEach(() => {
    mockResolvedTheme = "light";
    mockUseDaybookSession.mockReturnValue(sessionResult());
  });

  afterEach(() => jest.clearAllMocks());

  it("keeps the five primary destinations in a bounded bottom row outside scrolling content", () => {
    const view = render(<AppShell><Text>Page content</Text></AppShell>);
    const navigation = view.UNSAFE_getByProps({ accessibilityRole: "tablist" });
    const navigationStyle = StyleSheet.flatten(navigation.props.style);

    expect(navigationStyle).toMatchObject({ flexDirection: "row", height: 58, width: "100%" });
    expect(view.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel)).toEqual([
      "Today",
      "Timeline",
      "Appointments",
      "Incidents",
      "Reports",
    ]);

    let ancestor: ReactTestInstance | null = navigation.parent;
    while (ancestor) {
      expect(ancestor.type).not.toBe(ScrollView);
      ancestor = ancestor.parent;
    }
  });

  it("uses the canonical web logo asset", () => {
    const view = render(<AppShell><Text>Page content</Text></AppShell>);

    expect(view.UNSAFE_getByType(Image).props.source).toBe(familyDaybookLogo);
  });

  it("uses a transparent pre-render of the web logo treatment in dark mode", () => {
    mockResolvedTheme = "dark";
    const view = render(<AppShell><Text>Page content</Text></AppShell>);

    expect(view.UNSAFE_getByType(Image).props.source).toBe(familyDaybookLogoDark);
  });

  it("slides the navigation drawer laterally instead of fading the modal", () => {
    const view = render(<AppShell><Text>Page content</Text></AppShell>);
    const modal = view.UNSAFE_getByType(Modal);

    expect(modal.props.animationType).toBe("none");
    fireEvent.press(view.getByLabelText("Open navigation"));

    const drawerStyle = StyleSheet.flatten(view.getByTestId("navigation-drawer").props.style);
    expect(drawerStyle.transform).toHaveLength(1);
    expect(drawerStyle.transform[0].translateX).toBeDefined();

    const safeAreaStyle = StyleSheet.flatten(view.getByTestId("navigation-drawer-safe-area").props.style);
    expect(safeAreaStyle).toMatchObject({ paddingBottom: 34, paddingTop: 59 });
  });

  it("offers appearance controls inside the drawer", () => {
    const view = render(<AppShell><Text>Page content</Text></AppShell>);

    fireEvent.press(view.getByLabelText("Open navigation"));

    expect(view.getByText("Appearance")).toBeTruthy();
    expect(view.getAllByRole("radio").map((radio) => radio.props.accessibilityLabel)).toEqual(["System", "Light", "Dark"]);
    fireEvent.press(view.getByRole("radio", { name: "Dark" }));
    expect(mockSetThemePreference).toHaveBeenCalledWith("dark");
  });

  it("replaces tab routes without stacking duplicates and ignores the active tab", () => {
    const view = render(<AppShell><Text>Page content</Text></AppShell>);

    fireEvent.press(view.getByRole("tab", { name: "Today" }));
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(view.getByRole("tab", { name: "Timeline" }));
    expect(mockReplace).toHaveBeenCalledWith("/timeline");
  });

  it("does not expose Today when the member cannot read open days", () => {
    mockUseDaybookSession.mockReturnValue(sessionResult(false));
    const view = render(<AppShell><Text>Page content</Text></AppShell>);

    expect(view.queryByRole("tab", { name: "Today" })).toBeNull();
    expect(view.getAllByRole("tab")).toHaveLength(4);
    fireEvent.press(view.getByLabelText("Family Daybook home"));
    expect(mockReplace).toHaveBeenCalledWith("/timeline");
  });
});
