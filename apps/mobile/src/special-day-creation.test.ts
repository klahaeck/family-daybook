import type { Settings } from "@family-daybook/contracts";

import { specialDayCreationPlan, specialDayInitialDate } from "./special-day-creation";

const children: Settings["children"] = [
  { id: "child_1", displayName: "Avery", birthdate: "2019-04-12", color: "sage", active: true, sortOrder: 1 },
  { id: "child_2", displayName: "Jordan", birthdate: "2021-08-03", color: "blue", active: true, sortOrder: 2 },
  { id: "child_inactive", displayName: "Inactive", birthdate: "2018-01-01", color: "amber", active: false, sortOrder: 3 },
];

const template: Settings["template"] = {
  id: "template_1",
  version: 3,
  effectiveFrom: "2026-01-01",
  items: [
    {
      id: "routine_breakfast",
      taskKey: "prepare_breakfast",
      label: "Breakfast",
      suggestedTime: "07:30",
      childIds: ["child_1", "child_2", "child_inactive"],
      weekdays: [2],
      active: true,
    },
    {
      id: "routine_school",
      taskKey: "school_dropoff",
      label: "School drop-off",
      suggestedTime: "08:15",
      childIds: ["child_1"],
      weekdays: [1, 3, 4, 5],
      active: true,
    },
    {
      id: "routine_inactive",
      taskKey: "custom",
      label: "Retired task",
      suggestedTime: "12:00",
      childIds: ["child_1"],
      weekdays: [2],
      active: false,
    },
  ],
};

describe("specialDayCreationPlan", () => {
  it("prefers the workspace date when the phone is in a different local day", () => {
    expect(specialDayInitialDate("2026-09-15", "2026-09-16")).toBe("2026-09-15");
  });

  it("assigns every active child to the selected caregiver", () => {
    const plan = specialDayCreationPlan({
      caregiverId: "caregiver_1",
      children,
      date: "2026-09-15",
      template,
    });

    expect(plan.assignments).toEqual([
      { childId: "child_1", caregiverIds: ["caregiver_1"] },
      { childId: "child_2", caregiverIds: ["caregiver_1"] },
    ]);
  });

  it("copies applicable routine tasks for the selected date and active children", () => {
    const plan = specialDayCreationPlan({
      caregiverId: "caregiver_1",
      children,
      date: "2026-09-15",
      template,
    });

    expect(plan.tasks).toEqual([
      {
        sourceRoutineItemId: "routine_breakfast",
        taskKey: "prepare_breakfast",
        childId: "child_1",
        label: "Breakfast",
        suggestedTime: "07:30",
      },
      {
        sourceRoutineItemId: "routine_breakfast",
        taskKey: "prepare_breakfast",
        childId: "child_2",
        label: "Breakfast",
        suggestedTime: "07:30",
      },
    ]);
  });
});
