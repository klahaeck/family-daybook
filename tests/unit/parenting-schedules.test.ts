import { describe, expect, it } from "vitest";
import { applyParentingSchedule, assertContributionCaregivers, isMyParentingDay, nextParentingSchedules, parentingAssignments, parentingScheduleSchema, routineCompletion, scheduleForDate } from "@/lib/domain/parenting-schedules";
import type { Caregiver, ParentingSchedule, TodayTask, Workspace } from "@/lib/domain/types";

const schedule: ParentingSchedule = { enabled: true, effectiveFrom: "2026-01-01", anchorDate: "2026-01-05", children: [{ childId: "child_a", days: Array.from({ length: 14 }, (_, i) => i < 7 ? "mine" : "other") }] };
const workspace = { id: "workspace", timezone: "America/Chicago", parentingSchedules: [schedule] } as Workspace;
const caregivers = [{ id: "me", isOwner: true, active: true }, { id: "other", isOwner: false, active: true }] as Caregiver[];
const task = { id: "routine", childIds: ["child_a"], plannedCaregiverIds: [] } as unknown as TodayTask;

describe("parenting schedules", () => {
  it("resolves alternating weeks and negative offsets from an anchor", () => {
    expect(isMyParentingDay(schedule, "child_a", "2026-01-05")).toBe(true);
    expect(isMyParentingDay(schedule, "child_a", "2026-01-11")).toBe(true);
    expect(isMyParentingDay(schedule, "child_a", "2026-01-12")).toBe(false);
    expect(isMyParentingDay(schedule, "child_a", "2026-01-19")).toBe(true);
    expect(isMyParentingDay(schedule, "child_a", "2026-01-04")).toBe(false);
  });
  it("supports 2-2-3 and calendar day arithmetic across DST and leap dates", () => {
    const rotation: ParentingSchedule = { ...schedule, anchorDate: "2024-02-26", children: [{ childId: "child_a", days: ["mine", "mine", "other", "other", "mine", "mine", "mine", "other", "other", "mine", "mine", "other", "other", "other"] }] };
    expect(isMyParentingDay(rotation, "child_a", "2024-02-29")).toBe(false);
    expect(isMyParentingDay(rotation, "child_a", "2024-03-10")).toBe(false);
    expect(isMyParentingDay(rotation, "child_a", "2024-03-11")).toBe(true);
  });
  it("selects effective versions and disabled versions restore ordinary routines", () => {
    const disabled = { ...schedule, effectiveFrom: "2026-02-01", enabled: false };
    expect(scheduleForDate({ parentingSchedules: [disabled, schedule] }, "2026-01-12")).toEqual(schedule);
    expect(scheduleForDate(workspace, "2025-12-31")).toBeUndefined();
    expect(isMyParentingDay(disabled, "child_a", "2026-02-02")).toBe(true);
  });
  it("validates cycle lengths and duplicate children", () => {
    expect(parentingScheduleSchema.safeParse(schedule).success).toBe(true);
    expect(parentingScheduleSchema.safeParse({ ...schedule, children: [...schedule.children, ...schedule.children] }).success).toBe(false);
    expect(parentingScheduleSchema.safeParse({ ...schedule, children: [{ childId: "child_a", days: ["mine"] }] }).success).toBe(false);
  });
  it("rejects backdated edits and cross-workspace child references", () => {
    expect(() => nextParentingSchedules(workspace, { ...schedule, anchorDate: "2026-01-06" }, ["child_a"], new Date("2026-01-20T12:00:00Z"))).toThrow("SCHEDULE_CANNOT_CHANGE_PAST_DAYS");
    expect(() => nextParentingSchedules(workspace, schedule, ["another_child"])).toThrow("INVALID_CHILD_REFERENCE");
    expect(nextParentingSchedules(workspace, schedule, ["child_a"])).toEqual([schedule]);
  });
  it("makes off-day routines optional and excludes even saved contributions from completion", () => {
    const tasks = applyParentingSchedule([task], workspace, { localDate: "2026-01-12" } as never, ["child_a"], caregivers);
    expect(tasks[0]).toMatchObject({ optional: true, allowedCaregiverIds: ["me"], plannedCaregiverIds: ["me"] });
    expect(routineCompletion([{ ...tasks[0], entry: {} }])).toEqual({ recorded: 0, total: 0, percent: 0 });
    expect(routineCompletion([{ entry: {} }, { optional: true, entry: {} }, {}])).toEqual({ recorded: 1, total: 2, percent: 50 });
  });
  it("keeps mixed-child routine slots stable while preserving per-child responsibility", () => {
    const tasks = applyParentingSchedule([{ ...task, childIds: ["child_a", "child_b"] }], workspace, { localDate: "2026-01-12" } as never, ["child_a", "child_b"], caregivers);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: "routine", optional: false, offDayChildIds: ["child_a"] });
  });
  it("honors special-day overrides and finalized assignments", () => {
    const override = { assignments: [{ childId: "child_a", caregiverIds: ["me"] }] } as never;
    expect(parentingAssignments(workspace, "2026-01-12", ["child_a"], caregivers, override)).toEqual([{ childId: "child_a", mine: true }]);
    const tasks = applyParentingSchedule([task], workspace, { localDate: "2026-01-12", parentingAssignments: [{ childId: "child_a", mine: true }] } as never, ["child_a"], caregivers);
    expect(tasks[0].optional).toBe(false);
  });
  it("allows either parent on my days but only me on off days", () => {
    expect(() => assertContributionCaregivers([{ childId: "child_a", mine: true }], ["child_a"], ["other"], caregivers)).not.toThrow();
    expect(() => assertContributionCaregivers([{ childId: "child_a", mine: false }], ["child_a"], ["me"], caregivers)).not.toThrow();
    expect(() => assertContributionCaregivers([{ childId: "child_a", mine: false }], ["child_a"], ["other"], caregivers)).toThrow("OFF_DAY_CONTRIBUTIONS_MUST_BE_YOURS");
  });
});
