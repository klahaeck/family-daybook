import { z } from "zod";
import { isValidLocalDate, localDateInTimezone } from "./dates";
import type { Caregiver, DailyLog, ParentingSchedule, SpecialArrangementDay, TodayTask, Workspace } from "./types";

export const parentingScheduleSchema = z.object({
  effectiveFrom: z.string().date(),
  anchorDate: z.string().date(),
  enabled: z.boolean(),
  children: z.array(z.object({
    childId: z.string().min(1),
    // Each position is a whole day relative to anchorDate, not a weekday.
    days: z.array(z.enum(["mine", "other"])).refine((days) => [7, 14, 21, 28].includes(days.length), "Choose a 1-4 week cycle"),
  })).min(1),
}).superRefine((value, ctx) => {
  if (new Set(value.children.map((child) => child.childId)).size !== value.children.length)
    ctx.addIssue({ code: "custom", path: ["children"], message: "Each child must appear once" });
});

export function scheduleForDate(workspace: Pick<Workspace, "parentingSchedules">, date: string) {
  return workspace.parentingSchedules?.filter((schedule) => schedule.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export function isMyParentingDay(schedule: ParentingSchedule | undefined, childId: string, date: string): boolean {
  if (!isValidLocalDate(date)) throw new Error("INVALID_LOCAL_DATE");
  if (!schedule?.enabled) return true;
  const child = schedule.children.find((item) => item.childId === childId);
  if (!child) return true;
  const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${schedule.anchorDate}T00:00:00Z`)) / 86400000);
  return child.days[((offset % child.days.length) + child.days.length) % child.days.length] === "mine";
}

export function nextParentingSchedules(workspace: Workspace, input: ParentingSchedule | undefined, childIds: string[], now = new Date()): ParentingSchedule[] | undefined {
  if (!input) return workspace.parentingSchedules;
  const parsed = parentingScheduleSchema.parse(input);
  if (parsed.children.some((child) => !childIds.includes(child.childId))) throw new Error("INVALID_CHILD_REFERENCE");
  const existing = workspace.parentingSchedules ?? [];
  if (existing.some((item) => JSON.stringify(parentingScheduleSchema.parse(item)) === JSON.stringify(parsed))) return existing;
  if (parsed.effectiveFrom < localDateInTimezone(now, workspace.timezone)) throw new Error("SCHEDULE_CANNOT_CHANGE_PAST_DAYS");
  // Same-day revisions replace only that effective date; earlier versions stay intact.
  return [...existing.filter((item) => item.effectiveFrom !== parsed.effectiveFrom), parsed]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

export function parentingAssignments(workspace: Workspace, date: string, childIds: string[], caregivers: Caregiver[], arrangement?: SpecialArrangementDay | null) {
  const schedule = scheduleForDate(workspace, date);
  const owner = caregivers.find((caregiver) => caregiver.isOwner)?.id;
  return childIds.map((childId) => {
    const override = schedule?.enabled ? arrangement?.assignments.find((item) => item.childId === childId) : undefined;
    return { childId, mine: override && owner ? override.caregiverIds.includes(owner) : isMyParentingDay(schedule, childId, date) };
  });
}

export function applyParentingSchedule(tasks: TodayTask[], workspace: Workspace, log: DailyLog, childIds: string[], caregivers: Caregiver[], arrangement?: SpecialArrangementDay | null): TodayTask[] {
  const assignments = log.parentingAssignments ?? parentingAssignments(workspace, log.localDate, childIds, caregivers, arrangement);
  const schedule = scheduleForDate(workspace, log.localDate);
  if (!schedule?.enabled && !log.parentingAssignments) return tasks;
  const ownerIds = caregivers.filter((item) => item.isOwner && item.active).map((item) => item.id);
  return tasks.map((task) => {
    const offDayChildIds = task.childIds.filter((id) => assignments.find((item) => item.childId === id)?.mine === false);
    const optional = offDayChildIds.length === task.childIds.length;
    return { ...task, optional, offDayChildIds,
      allowedCaregiverIds: optional ? ownerIds : undefined,
      plannedCaregiverIds: optional ? ownerIds : task.plannedCaregiverIds.length ? task.plannedCaregiverIds : ownerIds };
  });
}

export function routineCompletion(tasks: Array<{ optional?: boolean; offDayChildIds?: string[]; entry?: { childIds?: string[] }; recorded?: boolean }>) {
  const expected = tasks.filter((task) => !task.optional);
  const recorded = expected.filter((task) => task.entry
    ? !task.offDayChildIds?.length || task.entry.childIds?.some((id) => !task.offDayChildIds!.includes(id))
    : task.recorded).length;
  return { recorded, total: expected.length, percent: expected.length ? Math.round(recorded / expected.length * 100) : 0 };
}

export function assertContributionCaregivers(assignments: Array<{ childId: string; mine: boolean }>, childIds: string[], caregiverIds: string[], caregivers: Caregiver[]) {
  if (childIds.some((id) => assignments.find((item) => item.childId === id)?.mine === false) &&
      caregiverIds.some((id) => !caregivers.some((caregiver) => caregiver.id === id && caregiver.isOwner))) {
    throw new Error("OFF_DAY_CONTRIBUTIONS_MUST_BE_YOURS");
  }
}
