import { fireEvent, render } from "@testing-library/react-native";
import type { ParentingSchedule } from "@family-daybook/contracts";
import { ParentingScheduleEditor } from "./parenting-schedule-editor";

jest.mock("@/mobile-theme", () => {
  const { lightColors } = jest.requireActual<typeof import("@/theme")>("@/theme");
  return { useAppTheme: () => ({ colors: lightColors }), useThemedStyles: <T,>(factory: (colors: typeof lightColors) => T): T => factory(lightColors) };
});
jest.mock("@expo/vector-icons/Ionicons", () => {
  const { Text: MockText } = jest.requireActual<typeof import("react-native")>("react-native");
  return { __esModule: true, default: ({ name }: { name: string }) => <MockText>{name}</MockText> };
});

describe("ParentingScheduleEditor", () => {
  const childOptions = [{ id: "child_a", displayName: "Alex" }, { id: "child_b", displayName: "Sam" }];
  const today = "2026-11-19";
  it("enables an optional two-week schedule for every child", () => {
    const onChange = jest.fn();
    const view = render(<ParentingScheduleEditor onChange={onChange} childOptions={childOptions} today={today} />);
    fireEvent.press(view.getByText("Enable parenting schedule"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, effectiveFrom: today, anchorDate: today, children: childOptions.map((child) => ({ childId: child.id, days: Array(14).fill("mine") })) }));
  });
  it("offers rotations and can apply one child's pattern to all children", () => {
    const value: ParentingSchedule = { enabled: true, effectiveFrom: today, anchorDate: today, children: childOptions.map((child) => ({ childId: child.id, days: Array(14).fill("mine") })) };
    const onChange = jest.fn();
    const view = render(<ParentingScheduleEditor value={value} onChange={onChange} childOptions={childOptions} today={today} />);
    fireEvent.press(view.getAllByText("2-2-3")[0]);
    const rotation = onChange.mock.calls[0][0] as ParentingSchedule;
    expect(rotation.children[0].days).toEqual(["mine", "mine", "other", "other", "mine", "mine", "mine", "other", "other", "mine", "mine", "other", "other", "other"]);
    view.rerender(<ParentingScheduleEditor value={rotation} onChange={onChange} childOptions={childOptions} today={today} />);
    fireEvent.press(view.getAllByText("Apply to all children")[0]);
    const applied = onChange.mock.calls.at(-1)![0] as ParentingSchedule;
    expect(applied.children[1].days).toEqual(applied.children[0].days);
  });
});
