import { fireEvent, render } from "@testing-library/react-native";

import { SettingsSectionTabs } from "./settings-section-tabs";

jest.mock("@/mobile-theme", () => {
  const { lightColors } = jest.requireActual<typeof import("@/theme")>("@/theme");
  return {
    useAppTheme: () => ({ colors: lightColors }),
    useThemedStyles: <T,>(factory: (colors: typeof lightColors) => T): T => factory(lightColors),
  };
});

jest.mock("@expo/vector-icons/Ionicons", () => {
  const { Text: MockText } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <MockText>{name}</MockText>,
  };
});

describe("SettingsSectionTabs", () => {
  it("matches the web settings section order and exposes selected state", () => {
    const onChange = jest.fn();
    const view = render(<SettingsSectionTabs value="family" onChange={onChange} />);
    const tabs = view.getAllByRole("tab");

    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual(["Family", "Routine", "Access"]);
    expect(view.getByRole("tab", { name: "Family" }).props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(view.getByRole("tab", { name: "Access" }));
    expect(onChange).toHaveBeenCalledWith("access");
  });
});
