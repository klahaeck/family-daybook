import { render } from "@testing-library/react-native";
import { ZodError } from "zod";

import { ScreenState } from "./ui";

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

describe("ScreenState", () => {
  it("replaces validation internals with a user-safe error message", () => {
    const error = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        path: ["careEntries", 0, "arrangementTaskId"],
        message: "Invalid input: expected string, received null",
      },
    ]);

    const view = render(<ScreenState error={error} />);

    expect(view.getByText("We couldn’t load this content")).toBeTruthy();
    expect(view.getByText("Family Daybook received unexpected data. Please try again or update the app.")).toBeTruthy();
    expect(view.queryByText(/arrangementTaskId/)).toBeNull();
    expect(view.queryByText(/expected string/)).toBeNull();
  });

  it("renders non-error failures as a generic recovery message", () => {
    const view = render(<ScreenState error={{ internal: "database details" }} />);

    expect(view.getByText("Something went wrong. Please try again.")).toBeTruthy();
    expect(view.queryByText(/database details/)).toBeNull();
  });
});
