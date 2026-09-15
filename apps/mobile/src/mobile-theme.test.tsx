import { fireEvent, render } from "@testing-library/react-native";
import { Appearance, Pressable, Text } from "react-native";

import { MobileThemeProvider, useAppTheme } from "./mobile-theme";

const mockGetItem = jest.fn<string | null, [string]>();
const mockSetItemAsync = jest.fn<Promise<void>, [string, string]>();

jest.mock("expo-secure-store", () => ({
  getItem: (key: string) => mockGetItem(key),
  setItemAsync: (key: string, value: string) => mockSetItemAsync(key, value),
}));

function ThemeProbe() {
  const theme = useAppTheme();
  return (
    <>
      <Text>{`${theme.preference}:${theme.resolvedTheme}`}</Text>
      <Pressable accessibilityRole="button" onPress={() => theme.setPreference("light")}><Text>Use light</Text></Pressable>
    </>
  );
}

describe("MobileThemeProvider", () => {
  beforeEach(() => {
    mockGetItem.mockReturnValue("dark");
    mockSetItemAsync.mockResolvedValue(undefined);
    jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it.each([null, "sepia"])("defaults to the system appearance for an invalid stored value (%s)", (stored) => {
    mockGetItem.mockReturnValue(stored);
    const view = render(<MobileThemeProvider><ThemeProbe /></MobileThemeProvider>);

    expect(view.getByText("system:light")).toBeTruthy();
    expect(Appearance.setColorScheme).toHaveBeenCalledWith("unspecified");
  });

  it("restores and persists a configurable appearance", () => {
    const view = render(<MobileThemeProvider><ThemeProbe /></MobileThemeProvider>);

    expect(view.getByText("dark:dark")).toBeTruthy();
    expect(Appearance.setColorScheme).toHaveBeenCalledWith("dark");

    fireEvent.press(view.getByRole("button", { name: "Use light" }));

    expect(view.getByText("light:light")).toBeTruthy();
    expect(mockSetItemAsync).toHaveBeenCalledWith("family-daybook.appearance", "light");
  });
});
