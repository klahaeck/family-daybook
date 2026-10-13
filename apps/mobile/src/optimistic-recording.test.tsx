import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Day } from "@family-daybook/contracts";
import type { ReactNode } from "react";
import TodayScreen from "./app/(app)/index";
import AppointmentsScreen from "./app/(app)/appointments";

const mockApi = { getDay: jest.fn(), getSettings: jest.fn(), recordRoutine: jest.fn(), createCareRecord: jest.fn(), listAppointments: jest.fn(), createAppointment: jest.fn() };
jest.mock("@/providers", () => ({
  useApi: () => mockApi,
  useDaybookSession: () => ({ data: { currentLocalDate: "2026-10-13", workspace: { timezone: "America/Chicago" }, member: { role: "owner" }, billing: { status: "active" }, capabilities: { mutateRecords: true, finalizeDays: true } } }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }), Redirect: () => null }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "temporary" }));
jest.mock("@/mobile-theme", () => {
  const { lightColors } = jest.requireActual<typeof import("@/theme")>("@/theme");
  return { useAppTheme: () => ({ colors: lightColors }), useThemedStyles: <T,>(factory: (colors: typeof lightColors) => T) => factory(lightColors) };
});
jest.mock("@expo/vector-icons/Ionicons", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return { __esModule: true, default: ({ name }: { name: string }) => <Text>{name}</Text> };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return { SafeAreaView: ({ children }: { children: ReactNode }) => <View>{children}</View> };
});

const day: Day = { localDate: "2026-10-13", status: "open", dayVersion: "version-1", careEntries: [],
  tasks: [{ id: "task", source: "routine", templateItemId: "routine", taskKey: "prepare_breakfast", label: "Breakfast", childIds: ["child"], suggestedTime: "07:30", sortOrder: 0, plannedCaregiverIds: ["caregiver"], recorded: false }],
  completion: { recorded: 0, total: 1, percent: 0 },
};
const clients: QueryClient[] = [];
function mount(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 }, mutations: { gcTime: 0 } } });
  clients.push(client);
  return { client, ...render(<QueryClientProvider client={client}>{children}</QueryClientProvider>) };
}

describe("optimistic mobile records", () => {
  afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getDay.mockResolvedValue(day);
    mockApi.getSettings.mockResolvedValue({ children: [{ id: "child", displayName: "Sam", active: true }], caregivers: [{ id: "caregiver", displayName: "Parent", active: true }] });
    mockApi.listAppointments.mockResolvedValue([]);
  });

  it("updates a routine immediately while preserving version checks and restores input on failure", async () => {
    let reject!: (error: Error) => void;
    mockApi.recordRoutine.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const view = mount(<TodayScreen />);
    fireEvent.press(await view.findByLabelText("Record Breakfast"));
    fireEvent.changeText(view.getByLabelText("Actual local time (HH:mm)"), "08:15");
    fireEvent.press(view.getByText("Save care record"));
    await waitFor(() => expect(view.getByText("100%")).toBeTruthy());
    expect(view.getByLabelText("View Breakfast").props.accessibilityState?.disabled ?? view.getByLabelText("View Breakfast").props.disabled).toBe(true);
    expect(mockApi.recordRoutine).toHaveBeenCalledWith("2026-10-13", expect.objectContaining({ localTime: "08:15", routineId: "routine" }), "version-1");
    expect(view.client.getQueryData<Day>(["day", day.localDate])?.completion.percent).toBe(0);
    await act(async () => reject(new Error("Save rejected")));
    expect(await view.findByText("Save rejected")).toBeTruthy();
    expect(view.getByLabelText("Actual local time (HH:mm)").props.value).toBe("08:15");
    expect(view.getByText("0%")).toBeTruthy();
  });

  it("shows pending appointments and removes them on rejection without clearing the form", async () => {
    let reject!: (error: Error) => void;
    mockApi.createAppointment.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const view = mount(<AppointmentsScreen />);
    await view.findByText("Sam");
    fireEvent.changeText(view.getByLabelText("Title"), "Dentist checkup");
    fireEvent.press(view.getAllByText("Sam").at(-1)!);
    fireEvent.press(view.getByText("Parent"));
    fireEvent.press(view.getByRole("button", { name: "Add appointment" }));
    expect(await view.findByText("Dentist checkup")).toBeTruthy();
    expect(view.getAllByText("Saving…").length).toBeGreaterThan(0);
    await act(async () => reject(new Error("Connection failed")));
    expect(await view.findByText("Connection failed")).toBeTruthy();
    expect(view.queryByText("Dentist checkup")).toBeNull();
    expect(view.getByLabelText("Title").props.value).toBe("Dentist checkup");
  });

  it("restores a custom record draft after the sheet has closed for a failed save", async () => {
    let reject!: (error: Error) => void;
    mockApi.createCareRecord.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const view = mount(<TodayScreen />);
    fireEvent.press(await view.findByRole("button", { name: "Add record" }));
    fireEvent.changeText(view.getByLabelText("What happened?"), "Homework");
    fireEvent.changeText(view.getByLabelText("Time (HH:mm)"), "16:45");
    fireEvent.changeText(view.getAllByLabelText("Notes (optional)").at(-1)!, "Read two chapters.");
    fireEvent.press(view.getAllByText("Sam").at(-1)!);
    fireEvent.press(view.getByText("Parent"));
    fireEvent.press(view.getByText("Save entry"));
    expect(await view.findByText("Homework · Saving…")).toBeTruthy();
    expect(view.getByText("0%")).toBeTruthy();
    await act(async () => reject(new Error("Custom save rejected")));
    expect(await view.findByText("Custom save rejected")).toBeTruthy();
    expect(view.getByLabelText("What happened?").props.value).toBe("Homework");
    expect(view.getByLabelText("Time (HH:mm)").props.value).toBe("16:45");
    expect(view.getAllByLabelText("Notes (optional)").at(-1)!.props.value).toBe("Read two chapters.");
  });
});
