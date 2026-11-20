import { parentingScheduleVersion } from "@/lib/repository/helpers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryParentingRepository, resetMemoryRepository } from "@/lib/repository/memory-repository";
import { localDateInTimezone, localDateTimeToUtc, shiftLocalDate } from "@/lib/domain/dates";
import type { ParentingSchedule } from "@/lib/domain/types";

describe("parenting schedule repository integration", () => {
  beforeEach(() => resetMemoryRepository());

  async function setup() {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext({ authUserId: "demo_owner", email: "owner@example.local", displayName: "Demo owner", mfaEnabled: true, demo: true });
    const settings = await repository.getSettings(context);
    const today = localDateInTimezone(new Date(), settings.workspace.timezone);
    const input = {
      name: settings.workspace.name, timezone: settings.workspace.timezone, hardDeleteEnabled: false,
      children: settings.children.map(({ id, displayName, birthdate }) => ({ id, displayName, birthdate })),
      caregivers: settings.caregivers.map(({ id, displayName, relationship }) => ({ id, displayName, relationship })),
      routineItems: settings.template.items,
    };
    const schedule: ParentingSchedule = { effectiveFrom: today, anchorDate: today, enabled: true, children: settings.children.map((child) => ({ childId: child.id, days: Array.from({ length: 14 }, (_, i) => i < 7 ? "mine" : "other") })) };
    await repository.updateSettings(context, { ...input, parentingSchedule: schedule });
    const owner = settings.caregivers.find((item) => item.isOwner)!;
    const other = settings.caregivers.find((item) => !item.isOwner)!;
    return { repository, context, settings, today, input, schedule, owner, other };
  }

  it("records the other parent's help on my day and only my contributions on an off day", async () => {
    const { repository, context, today, settings, owner, other } = await setup();
    expect(other).toBeDefined();
    const childIds = [settings.children[0].id];
    const care = { localDate: today, taskKey: "custom" as const, taskLabel: "Help with dinner", childIds, caregiverIds: [other.id], status: "completed" as const, occurredAt: localDateTimeToUtc(`${today}T18:00`, context.workspace.timezone) };
    const help = await repository.createCareEntry(context, care);
    expect(help.caregiverIds).toEqual([other.id]);
    const offDate = shiftLocalDate(today, 7);
    const offCare = { ...care, localDate: offDate, occurredAt: localDateTimeToUtc(`${offDate}T18:00`, context.workspace.timezone) };
    await expect(repository.createCareEntry(context, offCare)).rejects.toThrow("OFF_DAY_CONTRIBUTIONS_MUST_BE_YOURS");
    const contribution = await repository.createCareEntry(context, { ...offCare, caregiverIds: [owner.id] });
    await expect(repository.updateCareEntry(context, { ...offCare, recordId: contribution.id })).rejects.toThrow("OFF_DAY_CONTRIBUTIONS_MUST_BE_YOURS");
    const dashboard = await repository.getDashboard(context, offDate);
    expect(dashboard.tasks.every((item) => item.optional)).toBe(true);
    expect(dashboard.completion).toEqual({ recorded: 0, total: 0, percent: 0 });
  });

  it("keeps finalized responsibility stable and changes open day versions when schedule changes", async () => {
    const { repository, context, today, input, schedule, settings, other } = await setup();
    await repository.getDashboard(context, today);
    const before = await repository.getDayVersion(context, today);
    await repository.updateSettings(context, { ...input, parentingSchedule: { ...schedule, children: schedule.children.map((child) => ({ ...child, days: Array(14).fill("other") })) } });
    expect(await repository.getDayVersion(context, today)).not.toBe(before);
    await repository.finalizeDailyLog(context, today);
    const finalizedVersion = await repository.getDayVersion(context, today);
    await repository.updateSettings(context, { ...input, parentingSchedule: schedule });
    const dashboard = await repository.getDashboard(context, today);
    expect(dashboard.tasks.every((item) => item.optional)).toBe(true);
    expect(await repository.getDayVersion(context, today)).toBe(finalizedVersion);
    await expect(repository.createCareEntry(context, { localDate: today, taskKey: "custom", taskLabel: "Other help", childIds: [settings.children[0].id], caregiverIds: [other.id], status: "completed", occurredAt: localDateTimeToUtc(`${today}T18:00`, context.workspace.timezone) })).rejects.toThrow("DAY_FINALIZED");
  });

  it("retains past schedule versions when a later rotation starts", async () => {
    const { repository, context, today, input, schedule } = await setup();
    const later = shiftLocalDate(today, 14);
    const saved = await repository.updateSettings(context, { ...input, parentingSchedule: { ...schedule, effectiveFrom: later, children: schedule.children.map((child) => ({ ...child, days: Array(7).fill("other") })) } });
    expect(saved.workspace.parentingSchedules).toHaveLength(2);
    expect((await repository.getDashboard(context, today)).tasks.every((task) => !task.optional)).toBe(true);
    expect((await repository.getDashboard(context, later)).tasks.every((task) => task.optional)).toBe(true);
  });
});


describe.skipIf(!process.env.TEST_MONGODB_URI)("Mongo parenting schedule parity", () => {
  beforeAll(() => {
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    process.env.MONGODB_DB = `parenting_schedule_test_${Date.now()}`;
  });
  afterAll(async () => {
    const { getDatabase } = await import("@/lib/db/mongodb");
    await (await getDatabase()).dropDatabase();
  });
  it("persists rotations, enforces contributions and snapshots finalized assignments", async () => {
    const { MongoParentingRepository } = await import("@/lib/repository/mongo-repository");
    const repository = new MongoParentingRepository();
    const context = await repository.resolveContext({ authUserId: "schedule-owner", email: "schedule@example.test", displayName: "Schedule owner", mfaEnabled: true, demo: false });
    let settings = await repository.getSettings(context);
    const today = localDateInTimezone(new Date(), settings.workspace.timezone);
    const input = { name: settings.workspace.name, timezone: settings.workspace.timezone, hardDeleteEnabled: false, children: settings.children, caregivers: settings.caregivers.map(({ id, displayName, relationship }) => ({ id, displayName, relationship })), routineItems: settings.template.items };
    await repository.updateSettings(context, { ...input, caregivers: [...input.caregivers, { displayName: "Other parent", relationship: "Parent" }] });
    settings = await repository.getSettings(context);
    const schedule: ParentingSchedule = { effectiveFrom: today, anchorDate: today, enabled: true, children: settings.children.map((child) => ({ childId: child.id, days: Array(14).fill("other") })) };
    const initialVersion = parentingScheduleVersion(settings.workspace.parentingSchedules);
    const saved = await repository.updateParentingSchedule(context, schedule, initialVersion);
    expect(saved.schedules).toEqual([schedule]);
    await expect(repository.updateParentingSchedule(context, { ...schedule, enabled: false }, initialVersion)).rejects.toThrow("VERSION_CONFLICT");
    const refreshed = await repository.resolveContext({ authUserId: "schedule-owner", email: "schedule@example.test", displayName: "Schedule owner", mfaEnabled: true, demo: false });
    expect((await repository.getSettings(refreshed)).workspace.parentingSchedules).toEqual([schedule]);
    const dashboard = await repository.getDashboard(context, today);
    expect(dashboard.tasks.every((task) => task.optional)).toBe(true);
    const owner = settings.caregivers.find((caregiver) => caregiver.isOwner)!;
    const other = settings.caregivers.find((caregiver) => !caregiver.isOwner)!;
    const care = { localDate: today, taskKey: "custom" as const, taskLabel: "Extra school pickup", childIds: [settings.children[0].id], caregiverIds: [other.id], status: "completed" as const, occurredAt: localDateTimeToUtc(`${today}T15:00`, context.workspace.timezone) };
    await expect(repository.createCareEntry(context, care)).rejects.toThrow("OFF_DAY_CONTRIBUTIONS_MUST_BE_YOURS");
    const entry = await repository.createCareEntry(context, { ...care, caregiverIds: [owner.id] });
    await expect(repository.updateCareEntry(context, { ...care, recordId: entry.id })).rejects.toThrow("OFF_DAY_CONTRIBUTIONS_MUST_BE_YOURS");
    await repository.finalizeDailyLog(context, today);
    const version = await repository.getDayVersion(context, today);
    await repository.updateParentingSchedule(context, { ...schedule, enabled: false }, saved.scheduleVersion);
    expect((await repository.getDashboard(context, today)).tasks.every((task) => task.optional)).toBe(true);
    expect(await repository.getDayVersion(context, today)).toBe(version);
  });
});
