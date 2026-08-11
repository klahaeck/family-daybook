// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TodayDashboard } from "@/components/app/today-dashboard";
import { createCareEntryAction, updateDailyLogNotesAction } from "@/app/actions";
import { createSeedState } from "@/lib/repository/seed";
import type { DashboardData } from "@/lib/domain/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/app/actions", () => ({
  correctCareEntryAction: vi.fn(),
  createCareEntryAction: vi.fn(),
  finalizeDailyLogAction: vi.fn(),
  updateCareEntryAction: vi.fn(),
  updateDailyLogNotesAction: vi.fn(),
}));

vi.mock("@/lib/fetchers", () => ({
  fetchDashboard: vi.fn(),
}));

function renderDashboard(
  status: "open" | "finalized" = "open",
  specialArrangement = false,
  notes?: string,
) {
  const state = createSeedState(true);
  const dailyLog = state.dailyLogs[0];
  dailyLog.status = status;
  dailyLog.notes = notes;
  const template = state.templates[0];
  let tasks: DashboardData["tasks"] = template.items.map((item) => ({
    ...item,
    source: "routine" as const,
    templateItemId: item.id,
    plannedCaregiverIds: [],
    entry: state.careEntries.find((entry) => entry.templateItemId === item.id),
  }));
  const arrangement = specialArrangement
    ? {
        id: "arrangement_day",
        workspaceId: state.workspace.id,
        seriesId: "arrangement_series",
        dailyLogId: dailyLog.id,
        localDate: dailyLog.localDate,
        title: "Camping weekend",
        status: "active" as const,
        assignments: [
          {
            childId: state.children[0].id,
            caregiverIds: [state.caregivers[1].id],
          },
        ],
        tasks: [
          {
            id: "arrangement_task",
            taskKey: "prepare_breakfast" as const,
            childId: state.children[0].id,
            label: "Camp breakfast",
            suggestedTime: "08:00",
            sortOrder: 1,
          },
        ],
        currentRevisionId: "arrangement_revision",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: state.members[0].id,
      }
    : undefined;
  if (arrangement) {
    tasks = arrangement.tasks.map((task) => ({
      id: task.id,
      source: "special_arrangement" as const,
      arrangementTaskId: task.id,
      taskKey: task.taskKey,
      label: task.label,
      childIds: [task.childId],
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      suggestedTime: task.suggestedTime,
      sortOrder: task.sortOrder,
      active: true,
      plannedCaregiverIds: arrangement.assignments[0].caregiverIds,
    }));
  }
  const recordedCount = tasks.filter((task) => Boolean(task.entry)).length;
  const data: DashboardData = {
    workspace: state.workspace,
    member: state.members[0],
    date: dailyLog.localDate,
    dailyLog,
    children: state.children,
    caregivers: state.caregivers,
    tasks,
    specialArrangement: arrangement,
    completion: {
      recorded: recordedCount,
      total: tasks.length,
      percent: Math.round((recordedCount / tasks.length) * 100),
    },
    recentEntries: state.careEntries,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <TodayDashboard
        date={dailyLog.localDate}
        today={dailyLog.localDate}
        initialData={data}
      />
    </QueryClientProvider>,
  );

  return { tasks };
}

describe("TodayDashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the day notes field below the record items and saves it", async () => {
    vi.mocked(updateDailyLogNotesAction).mockResolvedValueOnce({
      ok: true,
      data: { notes: "School called about tomorrow's schedule." },
    });
    renderDashboard();

    const field = screen.getByLabelText("Day notes (optional)");
    const routineSection = screen
      .getByRole("heading", { name: "Today’s routine" })
      .closest("section");
    expect(routineSection).not.toBeNull();
    expect(
      routineSection!.compareDocumentPosition(field) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.change(field, {
      target: { value: "School called about tomorrow's schedule." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));

    await waitFor(() =>
      expect(updateDailyLogNotesAction).toHaveBeenCalledWith({
        localDate: expect.any(String),
        notes: "School called about tomorrow's schedule.",
      }),
    );
    expect(await screen.findByText("Day notes saved.")).toBeInTheDocument();
  });

  it("shows finalized day notes as read-only", () => {
    renderDashboard("finalized", false, "Saved before finalization.");

    expect(screen.getByLabelText("Day notes (optional)")).toHaveValue(
      "Saved before finalization.",
    );
    expect(screen.getByLabelText("Day notes (optional)")).toHaveAttribute(
      "readonly",
    );
    expect(
      screen.queryByRole("button", { name: "Save notes" }),
    ).not.toBeInTheDocument();
  });

  it("opens an unfinalized routine item as a normal edit", () => {
    const { tasks } = renderDashboard();
    const completed = tasks.find((task) => task.entry);
    if (!completed?.entry) throw new Error("Expected a completed seed routine");

    fireEvent.click(screen.getByRole("button", { name: `Change ${completed.label}` }));

    expect(screen.getByRole("heading", { name: `Change ${completed.label}` })).toBeInTheDocument();
    expect(screen.getByLabelText("Factual notes (optional)")).toHaveValue(completed.entry.notes);
    expect(screen.getByRole("checkbox", { name: /Parent A/ })).toBeChecked();
    expect(screen.queryByLabelText("Reason for change")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("requires a correction reason after the day is finalized", () => {
    const { tasks } = renderDashboard("finalized");
    const completed = tasks.find((task) => task.entry);
    if (!completed?.entry) throw new Error("Expected a completed seed routine");

    fireEvent.click(screen.getByRole("button", { name: `Change ${completed.label}` }));

    expect(screen.getByLabelText("Reason for change")).toBeRequired();
    expect(screen.getByRole("button", { name: "Save correction" })).toBeEnabled();
  });

  it("does not preselect a caregiver for an unrecorded routine item", () => {
    const { tasks } = renderDashboard();
    const unrecorded = tasks.find((task) => !task.entry);
    if (!unrecorded) throw new Error("Expected an unrecorded seed routine");

    fireEvent.click(screen.getByRole("button", { name: `Record ${unrecorded.label}` }));

    expect(screen.getByRole("checkbox", { name: /Parent A/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Parent B/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save record" })).toBeDisabled();
  });

  it("prefills the planned caregiver for a special-arrangement task", () => {
    renderDashboard("open", true);

    fireEvent.click(screen.getByRole("button", { name: "Record Camp breakfast" }));

    expect(screen.getByRole("checkbox", { name: /Parent A/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Parent B/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save record" })).toBeEnabled();
  });

  it.each([
    ["Missed", "When was it expected?"],
    ["Not applicable", "Routine time"],
  ])(
    "records %s without a caregiver or care-only details",
    async (statusLabel, timeLabel) => {
      vi.mocked(createCareEntryAction).mockResolvedValueOnce({
        ok: true,
        data: { id: "care_non_occurrence" },
      });
      const { tasks } = renderDashboard();
      const task = tasks.find(
        (item) => item.taskKey === "time_together" && !item.entry,
      );
      if (!task) throw new Error("Expected an unrecorded time-together task");

      fireEvent.click(
        screen.getByRole("button", { name: `Record ${task.label}` }),
      );
      fireEvent.click(screen.getByText("Parent A", { exact: true }));
      fireEvent.change(screen.getByLabelText("Duration in minutes (optional)"), {
        target: { value: "30" },
      });
      fireEvent.change(screen.getByLabelText("Activity type"), {
        target: { value: "Reading" },
      });
      fireEvent.click(screen.getByRole("button", { name: statusLabel }));

      expect(screen.queryByText("Who provided the care?")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Duration in minutes (optional)")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Activity type")).not.toBeInTheDocument();
      expect(screen.getByLabelText(timeLabel)).toBeInTheDocument();
      expect(
        screen.getByText(/No care provider is assigned because this status/),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save record" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "Save record" }));

      await waitFor(() =>
        expect(createCareEntryAction).toHaveBeenCalledWith(
          expect.objectContaining({
            caregiverIds: [],
            status:
              statusLabel === "Missed" ? "missed" : "not_applicable",
            durationMinutes: undefined,
            activityType: undefined,
          }),
        ),
      );
    },
  );

  it("requires a newly selected caregiver after switching back to completed", () => {
    const { tasks } = renderDashboard("open", true);
    const task = tasks[0];

    fireEvent.click(screen.getByRole("button", { name: `Record ${task.label}` }));
    expect(screen.getByRole("checkbox", { name: /Parent B/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Missed" }));
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));

    expect(screen.getByRole("checkbox", { name: /Parent A/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Parent B/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save record" })).toBeDisabled();
  });
});
