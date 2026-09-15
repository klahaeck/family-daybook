import { fireEvent, render } from "@testing-library/react-native";

import { AppearancePicker } from "./appearance-picker";

const mockSetPreference = jest.fn();

jest.mock("@/mobile-theme", () => {
  const { lightColors } = jest.requireActual<typeof import("@/theme")>("@/theme");
  return {
    useAppTheme: () => ({ colors: lightColors, preference: "system", setPreference: mockSetPreference }),
    useThemedStyles: <T,>(factory: (colors: typeof lightColors) => T) => factory(lightColors),
  };
});

jest.mock("@expo/vector-icons/Ionicons", () => {
  const { Text: MockText } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <MockText>{name}</MockText>,
  };
});

describe("AppearancePicker", () => {
  afterEach(() => jest.clearAllMocks());

  it("offers the same configurable themes as the web app", () => {
    const view = render(<AppearancePicker />);
    const radios = view.getAllByRole("radio");

    expect(radios.map((radio) => radio.props.accessibilityLabel)).toEqual(["System", "Light", "Dark"]);
    expect(view.getByRole("radio", { name: "System" }).props.accessibilityState).toEqual({ checked: true });

    fireEvent.press(view.getByRole("radio", { name: "Dark" }));
    expect(mockSetPreference).toHaveBeenCalledWith("dark");
  });
});
