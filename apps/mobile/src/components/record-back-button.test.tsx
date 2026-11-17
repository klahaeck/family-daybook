import { fireEvent, render } from "@testing-library/react-native";
import { RecordBackButton } from "./record-back-button";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }),
}));
jest.mock("@/mobile-theme", () => {
  const { lightColors } = jest.requireActual<typeof import("@/theme")>("@/theme");
  return { useAppTheme: () => ({ colors: lightColors }), useThemedStyles: <T,>(factory: (colors: typeof lightColors) => T) => factory(lightColors) };
});
jest.mock("@expo/vector-icons/Ionicons", () => ({ __esModule: true, default: () => null }));

describe("RecordBackButton", () => {
  beforeEach(() => jest.clearAllMocks());

  it("pops the detail screen rather than replacing the existing list", () => {
    mockCanGoBack.mockReturnValue(true);
    const view = render(<RecordBackButton />);
    fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("falls back to the timeline when opened without navigation history", () => {
    mockCanGoBack.mockReturnValue(false);
    const view = render(<RecordBackButton />);
    fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(mockReplace).toHaveBeenCalledWith("/timeline");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
