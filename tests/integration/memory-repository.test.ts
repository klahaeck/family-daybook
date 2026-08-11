import { beforeEach, describe, expect, it } from "vitest";
import JSZip from "jszip";

import { MemoryParentingRepository, resetMemoryRepository } from "@/lib/repository/memory-repository";
import type { Identity } from "@/lib/auth/identity";
import type { Attachment } from "@/lib/domain/types";
import { generateEvidencePackage } from "@/lib/reporting/generate-package";
import { getPrivateFile } from "@/lib/storage/private-files";
import { localDateInTimezone, shiftLocalDate } from "@/lib/domain/dates";
import { createArrangementTasksForDate } from "@/lib/domain/arrangements";

const identity: Identity = {
  authUserId: "demo_owner",
  email: "owner@example.local",
  displayName: "Demo owner",
  mfaEnabled: true,
  demo: true,
};

describe("memory repository integration", () => {
  beforeEach(() => resetMemoryRepository());

  it("stores day notes while open and locks them at finalization", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const localDate = "2026-07-14";

    const saved = await repository.updateDailyLogNotes(context, {
      localDate,
      notes: "School called about tomorrow's schedule.",
    });
    expect(saved.notes).toBe("School called about tomorrow's schedule.");
    expect((await repository.getDashboard(context, localDate)).dailyLog.notes).toBe(
      "School called about tomorrow's schedule.",
    );

    const cleared = await repository.updateDailyLogNotes(context, {
      localDate,
      notes: "",
    });
    expect(cleared.notes).toBeUndefined();

    await repository.updateDailyLogNotes(context, {
      localDate,
      notes: "Saved before finalization.",
    });
    await repository.finalizeDailyLog(context, localDate);
    expect((await repository.getDashboard(context, localDate)).dailyLog.notes).toBe(
      "Saved before finalization.",
    );
    await expect(
      repository.updateDailyLogNotes(context, {
        localDate,
        notes: "Changed after finalization.",
      }),
    ).rejects.toThrow("DAY_FINALIZED");
  });

  it("creates an append-only correction revision", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const dashboard = await repository.getDashboard(context, "2026-07-14");
    const entry = await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      taskKey: "custom",
      taskLabel: "Prepared snack",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-14T12:00:00.000Z",
      notes: "Prepared fruit.",
    });
    await repository.finalizeDailyLog(context, "2026-07-14");
    await repository.correctRecord(context, {
      recordType: "care_entry",
      recordId: entry.id,
      correctedText: "Prepared sliced fruit.",
      reason: "Added a more precise description.",
    });
    const bundle = await repository.getRecordBundle(context, "care_entry", entry.id);
    expect(bundle?.revisions).toHaveLength(2);
    expect(bundle?.revisions[1].previousRevisionId).toBe(bundle?.revisions[0].id);
    expect(bundle?.revisions[1].hash).not.toBe(bundle?.revisions[0].hash);
  });

  it("updates an open-day care entry without appending a correction", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const dashboard = await repository.getDashboard(context, "2026-07-14");
    const entry = await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      taskKey: "time_together",
      taskLabel: "Time together",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-14T12:00:00.000Z",
      durationMinutes: 30,
      notes: "Prepared fruit.",
    });

    const updated = await repository.updateCareEntry(context, {
      recordId: entry.id,
      childIds: entry.childIds,
      caregiverIds: entry.caregiverIds,
      status: "partial",
      occurredAt: "2026-07-14T12:30:00.000Z",
      notes: "Prepared sliced fruit.",
    });

    expect(updated.durationMinutes).toBeUndefined();
    expect(updated).toMatchObject({
      id: entry.id,
      currentRevisionId: entry.currentRevisionId,
      status: "partial",
      occurredAt: "2026-07-14T12:30:00.000Z",
      notes: "Prepared sliced fruit.",
    });
    const bundle = await repository.getRecordBundle(context, "care_entry", entry.id);
    expect(bundle?.revisions).toHaveLength(1);
    expect(bundle?.revisions[0].payload).toMatchObject({
      status: "partial",
      notes: "Prepared sliced fruit.",
    });
    expect(bundle?.revisions[0].payload).not.toHaveProperty("durationMinutes");
    expect((await repository.getTimeline(context)).items.find((item) => item.id === entry.id)?.dailyLogStatus).toBe("open");
    await expect(
      repository.correctRecord(context, {
        recordType: "care_entry",
        recordId: entry.id,
        correctedText: "This should be a normal edit.",
        reason: "The day is still open.",
      }),
    ).rejects.toThrow("DAY_NOT_FINALIZED");

    await repository.finalizeDailyLog(context, "2026-07-14");
    expect((await repository.getTimeline(context)).items.find((item) => item.id === entry.id)?.dailyLogStatus).toBe("finalized");
    await expect(
      repository.updateCareEntry(context, {
        recordId: entry.id,
        childIds: entry.childIds,
        caregiverIds: entry.caregiverIds,
        status: "completed",
        occurredAt: "2026-07-14T12:45:00.000Z",
      }),
    ).rejects.toThrow("DAY_FINALIZED");
  });

  it("stores non-occurrence records without care-provider attribution", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const dashboard = await repository.getDashboard(context, "2026-07-14");

    for (const [index, status] of (["missed", "not_applicable"] as const).entries()) {
      const entry = await repository.createCareEntry(context, {
        localDate: "2026-07-14",
        taskKey: "custom",
        taskLabel: status === "missed" ? "School drop-off" : "Pack school lunch",
        childIds: [dashboard.children[0].id],
        caregiverIds: [],
        status,
        occurredAt: `2026-07-14T${12 + index}:00:00.000Z`,
        notes: status === "missed" ? "The drop-off did not occur." : "School provided lunch.",
      });
      const bundle = await repository.getRecordBundle(context, "care_entry", entry.id);

      expect(bundle?.record).toMatchObject({ status, caregiverIds: [] });
      expect(bundle?.revisions[0].payload).toMatchObject({
        status,
        caregiverIds: [],
      });
    }
  });

  it("counts every saved routine disposition as recorded", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const before = await repository.getDashboard(context, "2026-07-14");
    const task = before.tasks.find((item) => !item.entry);
    if (!task?.templateItemId) throw new Error("Expected an unrecorded routine item");

    await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      templateItemId: task.templateItemId,
      taskKey: task.taskKey,
      taskLabel: task.label,
      childIds: task.childIds,
      caregiverIds: [],
      status: "missed",
      occurredAt: "2026-07-14T12:00:00.000Z",
    });
    const after = await repository.getDashboard(context, "2026-07-14");

    expect(after.completion.recorded).toBe(before.completion.recorded + 1);
    expect(after.completion.total).toBe(before.completion.total);
  });

  it("rejects contradictory care-provider and non-occurrence details", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const dashboard = await repository.getDashboard(context, "2026-07-14");
    const shared = {
      localDate: "2026-07-14",
      taskKey: "custom" as const,
      taskLabel: "School drop-off",
      childIds: [dashboard.children[0].id],
      occurredAt: "2026-07-14T12:00:00.000Z",
    };

    await expect(
      repository.createCareEntry(context, {
        ...shared,
        caregiverIds: [],
        status: "completed",
      }),
    ).rejects.toThrow("INVALID_CAREGIVER_ATTRIBUTION");
    await expect(
      repository.createCareEntry(context, {
        ...shared,
        caregiverIds: [dashboard.caregivers[0].id],
        status: "missed",
      }),
    ).rejects.toThrow("INVALID_CAREGIVER_ATTRIBUTION");
    await expect(
      repository.createCareEntry(context, {
        ...shared,
        caregiverIds: [],
        status: "not_applicable",
        durationMinutes: 30,
      }),
    ).rejects.toThrow("INVALID_NON_OCCURRENCE_DETAILS");
  });

  it("clears care-only details when an open record becomes missed", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const dashboard = await repository.getDashboard(context, "2026-07-14");
    const entry = await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      taskKey: "time_together",
      taskLabel: "Time together",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-14T12:00:00.000Z",
      durationMinutes: 30,
      activityType: "Reading",
    });

    const updated = await repository.updateCareEntry(context, {
      recordId: entry.id,
      childIds: entry.childIds,
      caregiverIds: [],
      status: "missed",
      occurredAt: "2026-07-14T12:00:00.000Z",
      notes: "The activity did not occur.",
    });
    const bundle = await repository.getRecordBundle(context, "care_entry", entry.id);

    expect(updated).toMatchObject({
      caregiverIds: [],
      status: "missed",
      currentRevisionId: entry.currentRevisionId,
    });
    expect(updated.durationMinutes).toBeUndefined();
    expect(updated.activityType).toBeUndefined();
    expect(bundle?.revisions).toHaveLength(1);
    expect(bundle?.revisions[0].payload).toMatchObject({
      caregiverIds: [],
      status: "missed",
    });
    expect(bundle?.revisions[0].payload).not.toHaveProperty("durationMinutes");
    expect(bundle?.revisions[0].payload).not.toHaveProperty("activityType");
  });

  it("appends a caregiver-free correction when finalized care becomes not applicable", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const dashboard = await repository.getDashboard(context, "2026-07-14");
    const caregiverId = dashboard.caregivers[0].id;
    const entry = await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      taskKey: "time_together",
      taskLabel: "Time together",
      childIds: [dashboard.children[0].id],
      caregiverIds: [caregiverId],
      status: "completed",
      occurredAt: "2026-07-14T12:00:00.000Z",
      durationMinutes: 30,
      activityType: "Reading",
    });
    await repository.finalizeDailyLog(context, "2026-07-14");

    await repository.correctCareEntry(context, {
      recordId: entry.id,
      childIds: entry.childIds,
      caregiverIds: [],
      status: "not_applicable",
      occurredAt: entry.occurredAt,
      notes: "The routine item did not apply that day.",
      reason: "Corrected the status after reviewing the schedule.",
    });
    const bundle = await repository.getRecordBundle(context, "care_entry", entry.id);

    expect(bundle?.record).toMatchObject({
      caregiverIds: [],
      status: "not_applicable",
    });
    expect(bundle?.revisions).toHaveLength(2);
    expect(bundle?.revisions[0].payload).toMatchObject({
      caregiverIds: [caregiverId],
      status: "completed",
    });
    expect(bundle?.revisions[1].payload).toMatchObject({
      caregiverIds: [],
      status: "not_applicable",
    });
    expect(bundle?.revisions[1].previousRevisionId).toBe(bundle?.revisions[0].id);
    expect(bundle?.revisions[1].hash).not.toBe(bundle?.revisions[0].hash);
    expect(bundle?.revisions[1].payload).not.toHaveProperty("durationMinutes");
    expect(bundle?.revisions[1].payload).not.toHaveProperty("activityType");
  });

  it("corrects all editable care-entry details without replacing the prior revision", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const dashboard = await repository.getDashboard(context, "2026-07-14");
    const entry = await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      taskKey: "time_together",
      taskLabel: "Time together",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-14T12:00:00.000Z",
      durationMinutes: 30,
      notes: "Prepared fruit.",
    });

    await repository.finalizeDailyLog(context, "2026-07-14");

    await repository.correctCareEntry(context, {
      recordId: entry.id,
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers.at(-1)!.id],
      status: "partial",
      occurredAt: "2026-07-14T13:30:00.000Z",
      notes: "Prepared sliced fruit.",
      reason: "Corrected the caregiver, time, and outcome.",
    });

    const bundle = await repository.getRecordBundle(context, "care_entry", entry.id);
    expect(bundle?.record).toMatchObject({
      status: "partial",
      occurredAt: "2026-07-14T13:30:00.000Z",
      notes: "Prepared sliced fruit.",
    });
    expect(
      bundle?.record && "durationMinutes" in bundle.record
        ? bundle.record.durationMinutes
        : undefined,
    ).toBeUndefined();
    expect(bundle?.revisions).toHaveLength(2);
    expect(bundle?.revisions[0].payload).toMatchObject({
      status: "completed",
      notes: "Prepared fruit.",
    });
    expect(bundle?.revisions[1].payload).toMatchObject({
      status: "partial",
      notes: "Prepared sliced fruit.",
    });
    expect(bundle?.revisions[1].payload).not.toHaveProperty("durationMinutes");
  });

  it("blocks reviewer mutations at the repository boundary", async () => {
    const repository = new MemoryParentingRepository();
    const owner = await repository.resolveContext(identity);
    const reviewer = await repository.inviteReviewer(owner, {
      email: "attorney@example.com",
      displayName: "Attorney Reviewer",
    });
    reviewer.status = "active";
    reviewer.authUserId = "reviewer_user";
    const reviewerContext = await repository.resolveContext({
      ...identity,
      authUserId: "reviewer_user",
      email: reviewer.email,
    });
    expect(reviewerContext.billingOwnerAuthUserId).toBe(owner.identity.authUserId);
    await expect(
      repository.createIncident(reviewerContext, {
        category: "other",
        occurredAt: "2026-07-14T12:00:00.000Z",
        childIds: ["child_one"],
        peoplePresent: [],
        witnesses: [],
        observations: "A directly observed factual sequence.",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("does not expose attachments from an unfinalized care day to reviewers", async () => {
    const repository = new MemoryParentingRepository();
    const owner = await repository.resolveContext(identity);
    const dashboard = await repository.getDashboard(owner, "2026-07-15");
    const entry = await repository.createCareEntry(owner, {
      localDate: "2026-07-15",
      taskKey: "custom",
      taskLabel: "Prepared snack",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-15T12:00:00.000Z",
    });
    const attachment: Attachment = {
      id: "attachment_private_test",
      workspaceId: owner.workspace.id,
      recordType: "care_entry",
      recordId: entry.id,
      revisionId: entry.currentRevisionId,
      originalName: "note.png",
      contentType: "image/png",
      size: 12,
      sha256: "a".repeat(64),
      pathname: "attachments/private-test.png",
      uploadedAt: new Date().toISOString(),
      uploadedBy: owner.member.id,
    };
    await repository.addAttachment(owner, attachment);
    const reviewer = await repository.inviteReviewer(owner, {
      email: "private-review@example.com",
      displayName: "Private Review",
    });
    reviewer.status = "active";
    reviewer.authUserId = "private_review_user";
    const reviewerContext = await repository.resolveContext({
      ...identity,
      authUserId: "private_review_user",
      email: reviewer.email,
    });

    expect(await repository.getAttachment(reviewerContext, attachment.id)).toBeNull();
    expect((await repository.getTimeline(reviewerContext)).attachments).toHaveLength(0);

    await repository.finalizeDailyLog(owner, "2026-07-15");
    expect((await repository.getAttachment(reviewerContext, attachment.id))?.id).toBe(attachment.id);
    expect((await repository.getTimeline(reviewerContext)).attachments).toHaveLength(1);
  });

  it("includes special days in the timeline after applying finalized-day reviewer visibility", async () => {
    const repository = new MemoryParentingRepository();
    const owner = await repository.resolveContext(identity);
    const settings = await repository.getSettings(owner);
    const dates = ["2026-08-03", "2026-08-04"];
    const assignments = [
      {
        childId: settings.children[0].id,
        caregiverIds: [settings.caregivers[0].id],
      },
    ];
    const created = await repository.createSpecialArrangement(owner, {
      title: "Family visit",
      note: "The regular routine was adjusted for the visit.",
      startDate: dates[0],
      endDate: dates[1],
      assignments,
      days: dates.map((localDate) => ({
        localDate,
        tasks: createArrangementTasksForDate(
          localDate,
          settings.template,
          settings.children,
        ),
      })),
    });

    const ownerTimeline = await repository.getTimeline(owner);
    const timelineDays = ownerTimeline.items.filter((item) =>
      created.some((day) => day.id === item.id),
    );
    expect(timelineDays).toHaveLength(2);
    expect(timelineDays[0]).toMatchObject({
      kind: "special_day",
      title: "Family visit",
      description: "The regular routine was adjusted for the visit.",
      status: "active",
      childIds: [settings.children[0].id],
      caregiverIds: [settings.caregivers[0].id],
    });
    expect(
      timelineDays.map((item) =>
        localDateInTimezone(
          new Date(item.occurredAt),
          owner.workspace.timezone,
        ),
      ),
    ).toEqual([...dates].reverse());
    expect(
      ownerTimeline.revisions.filter((revision) =>
        created.some((day) => day.id === revision.recordId),
      ),
    ).toHaveLength(2);

    const reviewer = await repository.inviteReviewer(owner, {
      email: "special-days-review@example.com",
      displayName: "Special Days Reviewer",
    });
    reviewer.status = "active";
    reviewer.authUserId = "special_days_reviewer";
    const reviewerContext = await repository.resolveContext({
      ...identity,
      authUserId: reviewer.authUserId,
      email: reviewer.email,
    });
    expect(
      (await repository.getTimeline(reviewerContext)).items.some((item) =>
        created.some((day) => day.id === item.id),
      ),
    ).toBe(false);

    await repository.finalizeDailyLog(owner, dates[0]);
    const reviewerTimeline = await repository.getTimeline(reviewerContext);
    expect(
      reviewerTimeline.items.filter((item) =>
        created.some((day) => day.id === item.id),
      ).map((item) => item.id),
    ).toEqual([created[0].id]);
    expect(
      reviewerTimeline.revisions.filter((revision) =>
        created.some((day) => day.id === revision.recordId),
      ).map((revision) => revision.recordId),
    ).toEqual([created[0].id]);
  });

  it("starts with one child and persists a dynamic child list with birthdates", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const settings = await repository.getSettings(context);
    expect(settings.children).toHaveLength(1);

    const added = await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: [
        ...settings.children.map((child) => ({
          id: child.id,
          displayName: child.displayName,
          birthdate: child.birthdate,
        })),
        {
          id: "child_added",
          displayName: "Child Added",
          birthdate: "2020-06-30",
        },
      ],
      caregivers: settings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: settings.template.items.map((item) => ({
        id: item.id,
        label: item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.weekdays,
        active: item.active,
      })),
    });

    expect(added.children).toHaveLength(2);
    expect(added.children[1]).toMatchObject({
      id: "child_added",
      displayName: "Child Added",
      birthdate: "2020-06-30",
      active: true,
      sortOrder: 2,
    });

    const removed = await repository.updateSettings(context, {
      name: added.workspace.name,
      timezone: added.workspace.timezone,
      hardDeleteEnabled: added.workspace.hardDeleteEnabled,
      children: [{ id: "child_added", displayName: "Child Added", birthdate: "2020-06-30" }],
      caregivers: added.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: added.template.items.map((item) => ({
        id: item.id,
        label: item.label,
        suggestedTime: item.suggestedTime,
        childIds: ["child_added"],
        weekdays: item.weekdays,
        active: item.active,
      })),
    });

    expect(removed.children).toHaveLength(1);
    expect(removed.children[0].id).toBe("child_added");
    expect((await repository.getDashboard(context, "2026-07-15")).children).toHaveLength(1);
  });

  it("starts with two caregivers and persists additional caregivers", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const settings = await repository.getSettings(context);
    expect(settings.caregivers).toHaveLength(2);

    const updated = await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: settings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: [
        ...settings.caregivers.map((caregiver) => ({
          id: caregiver.id,
          displayName: caregiver.displayName,
          relationship: caregiver.relationship,
        })),
        { displayName: "Grandparent", relationship: "Grandparent" },
      ],
      routineItems: settings.template.items.map((item) => ({
        id: item.id,
        label: item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.weekdays,
        active: item.active,
      })),
    });

    expect(updated.caregivers).toHaveLength(3);
    expect(updated.caregivers[2]).toMatchObject({
      displayName: "Grandparent",
      relationship: "Grandparent",
      isOwner: false,
      active: true,
    });
    expect(updated.caregivers[2].id).toMatch(/^caregiver_/);
    expect((await repository.getDashboard(context, "2026-07-15")).caregivers).toHaveLength(3);
  });

  it("shows a routine item only on its selected weekdays", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const settings = await repository.getSettings(context);
    const naptime = settings.template.items.find((item) => item.taskKey === "naptime");
    expect(naptime).toBeDefined();

    const updated = await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: settings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: settings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: settings.template.items.map((item) => ({
        id: item.id,
        label: item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.taskKey === "naptime" ? [0, 6] : item.weekdays,
        active: item.active,
      })),
    });

    expect(updated.template.items.find((item) => item.id === naptime?.id)?.weekdays).toEqual([0, 6]);
    expect((await repository.getDashboard(context, "2026-07-18")).tasks)
      .toContainEqual(expect.objectContaining({ id: naptime?.id, label: "Naptime" }));
    expect((await repository.getDashboard(context, "2026-07-20")).tasks)
      .not.toContainEqual(expect.objectContaining({ id: naptime?.id }));
  });

  it("uses the latest routine for empty historical days and freezes it after an entry", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const today = localDateInTimezone(new Date(), context.workspace.timezone);
    const historicalDate = shiftLocalDate(today, -1);
    const nextDayDate = shiftLocalDate(today, 1);
    const historical = await repository.getDashboard(context, historicalDate);
    const originalToday = await repository.getDashboard(context, today);
    const originalTodayVersion = originalToday.dailyLog.templateVersion;
    const settings = await repository.getSettings(context);

    const updatedSettings = await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: settings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: settings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: [
        ...settings.template.items.slice(1).map((item, index) => ({
          id: item.id,
          label: index === 0 ? "Updated routine label" : item.label,
          suggestedTime: item.suggestedTime,
          childIds: item.childIds,
          weekdays: item.weekdays,
          active: item.active,
        })),
        {
          label: "Evening walk",
          suggestedTime: "18:30",
          childIds: settings.children.map((child) => child.id),
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          active: true,
        },
      ],
    });

    const savedAgain = await repository.updateSettings(context, {
      name: updatedSettings.workspace.name,
      timezone: updatedSettings.workspace.timezone,
      hardDeleteEnabled: updatedSettings.workspace.hardDeleteEnabled,
      children: updatedSettings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: updatedSettings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: updatedSettings.template.items.map((item) => ({
        id: item.id,
        label: item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.weekdays,
        active: item.active,
      })),
    });
    expect(savedAgain.template.version).toBe(2);

    const reopenedHistorical = await repository.getDashboard(context, historicalDate);
    const refreshedToday = await repository.getDashboard(context, today);
    const nextDay = await repository.getDashboard(context, nextDayDate);
    expect(reopenedHistorical.tasks.some((task) => task.id === settings.template.items[0].id)).toBe(false);
    expect(reopenedHistorical.tasks[0].label).toBe("Updated routine label");
    expect(reopenedHistorical.tasks.at(-1)?.label).toBe("Evening walk");
    expect(refreshedToday.tasks.some((task) => task.id === settings.template.items[0].id)).toBe(false);
    expect(refreshedToday.tasks.at(-1)?.label).toBe("Evening walk");
    expect(originalTodayVersion).toBe(1);
    expect(refreshedToday.dailyLog.templateVersion).toBe(2);
    expect(nextDay.tasks.some((task) => task.id === settings.template.items[0].id)).toBe(false);
    expect(nextDay.tasks[0].label).toBe("Updated routine label");
    expect(nextDay.tasks.at(-1)).toMatchObject({
      taskKey: "custom",
      label: "Evening walk",
      sortOrder: settings.template.items.length,
    });
    expect(nextDay.tasks.at(-1)?.id).toMatch(/^routine_/);
    expect(reopenedHistorical.dailyLog.templateVersion).toBe(2);
    expect(nextDay.dailyLog.templateVersion).toBe(2);

    const historicalEntry = await repository.createCareEntry(context, {
      localDate: historicalDate,
      taskKey: "custom",
      taskLabel: "Historical care",
      childIds: [historical.children[0].id],
      caregiverIds: [historical.caregivers[0].id],
      status: "completed",
      occurredAt: `${historicalDate}T12:00:00.000Z`,
    });
    expect(historicalEntry.dailyLogId).toBe(historical.dailyLog.id);
    expect(historicalEntry.lateEntry).toBe(false);
    historicalEntry.lateEntry = true;
    expect(
      (await repository.getTimeline(context)).items.find(
        (item) => item.id === historicalEntry.id,
      )?.lateEntry,
    ).toBe(false);
    expect(
      (await repository.getRecordBundle(
        context,
        "care_entry",
        historicalEntry.id,
      ))?.record,
    ).toMatchObject({ lateEntry: false });

    const olderDate = shiftLocalDate(today, -2);
    const older = await repository.getDashboard(context, olderDate);
    const olderEntry = await repository.createCareEntry(context, {
      localDate: olderDate,
      taskKey: "custom",
      taskLabel: "Older care",
      childIds: [older.children[0].id],
      caregiverIds: [older.caregivers[0].id],
      status: "completed",
      occurredAt: `${olderDate}T12:00:00.000Z`,
    });
    expect(olderEntry.lateEntry).toBe(true);

    const thirdVersion = await repository.updateSettings(context, {
      name: savedAgain.workspace.name,
      timezone: savedAgain.workspace.timezone,
      hardDeleteEnabled: savedAgain.workspace.hardDeleteEnabled,
      children: savedAgain.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: savedAgain.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: savedAgain.template.items.map((item, index) => ({
        id: item.id,
        label: index === 0 ? "Newest routine label" : item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.weekdays,
        active: item.active,
      })),
    });
    const lockedHistorical = await repository.getDashboard(context, historicalDate);
    expect(thirdVersion.template.version).toBe(3);
    expect(lockedHistorical.dailyLog.templateVersion).toBe(2);
    expect(lockedHistorical.tasks[0].label).toBe("Updated routine label");
  });

  it("keeps a finalized today log bound to its original routine version", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const today = localDateInTimezone(new Date(), context.workspace.timezone);
    const originalToday = await repository.getDashboard(context, today);
    const originalLabel = originalToday.tasks[0].label;
    await repository.finalizeDailyLog(context, today);
    const settings = await repository.getSettings(context);

    const updatedSettings = await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: settings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: settings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: settings.template.items.map((item, index) => ({
        id: item.id,
        label: index === 0 ? "Changed after finalizing" : item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.weekdays,
        active: item.active,
      })),
    });

    const finalizedToday = await repository.getDashboard(context, today);
    expect(updatedSettings.template.version).toBe(2);
    expect(finalizedToday.dailyLog.status).toBe("finalized");
    expect(finalizedToday.dailyLog.templateVersion).toBe(1);
    expect(finalizedToday.tasks[0].label).toBe(originalLabel);
  });

  it("generates a PDF and checksum evidence package from finalized records", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const date = localDateInTimezone(new Date(), context.workspace.timezone);
    await repository.finalizeDailyLog(context, date);
    const report = await repository.createReport(context, {
      from: date,
      to: date,
      childIds: [],
      includeCare: true,
      includeAppointments: true,
      includeIncidents: true,
    });
    const source = await repository.getReportSource(context, report.id);
    expect(source).not.toBeNull();
    const artifacts = await generateEvidencePackage(source!);
    const pdf = await getPrivateFile(artifacts.pdfPathname);
    const zip = await getPrivateFile(artifacts.zipPathname);
    expect(pdf?.contentType).toBe("application/pdf");
    expect(pdf?.body.length).toBeGreaterThan(500);
    expect(zip?.contentType).toBe("application/zip");
    expect(artifacts.manifestHash).toHaveLength(64);
  });

  it("plans, edits, finalizes, corrects, cancels, and reports special arrangements", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const settings = await repository.getSettings(context);
    const dates = ["2026-07-24", "2026-07-25", "2026-07-26"];
    const assignments = [
      {
        childId: settings.children[0].id,
        caregiverIds: [settings.caregivers[0].id],
      },
    ];
    const created = await repository.createSpecialArrangement(context, {
      title: "Camping weekend",
      startDate: dates[0],
      endDate: dates[2],
      assignments,
      days: dates.map((localDate) => ({
        localDate,
        tasks: createArrangementTasksForDate(
          localDate,
          settings.template,
          settings.children,
        ),
      })),
    });

    expect(created).toHaveLength(3);
    expect(new Set(created.map((day) => day.seriesId)).size).toBe(1);
    expect(created[0].tasks.every((task) => task.childId === settings.children[0].id)).toBe(
      true,
    );
    const finalDayLabels = created[2].tasks.map((task) => task.label);
    await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: settings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: settings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: settings.template.items.map((item, index) => ({
        id: item.id,
        label: index === 0 ? "Changed after planning" : item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.weekdays,
        active: item.active,
      })),
    });
    expect(
      (await repository.getDashboard(context, dates[2])).tasks.map(
        (task) => task.label,
      ),
    ).toEqual(finalDayLabels);
    const firstDashboard = await repository.getDashboard(context, dates[0]);
    expect(firstDashboard.specialArrangement?.title).toBe("Camping weekend");
    expect(firstDashboard.tasks[0]).toMatchObject({
      source: "special_arrangement",
      plannedCaregiverIds: [settings.caregivers[0].id],
    });
    const firstTask = firstDashboard.tasks[0];
    const arrangementEntry = await repository.createCareEntry(context, {
      localDate: dates[0],
      arrangementTaskId: firstTask.arrangementTaskId,
      taskKey: "custom",
      taskLabel: "Client-supplied label",
      childIds: firstTask.childIds,
      caregiverIds: [settings.caregivers[1].id],
      status: "completed",
      occurredAt: `${dates[0]}T13:00:00.000Z`,
    });
    expect(arrangementEntry).toMatchObject({
      arrangementTaskId: firstTask.arrangementTaskId,
      taskKey: firstTask.taskKey,
      taskLabel: firstTask.label,
      caregiverIds: [settings.caregivers[1].id],
    });
    expect(
      (await repository.getDashboard(context, dates[0])).tasks[0].entry?.id,
    ).toBe(arrangementEntry.id);
    await expect(
      repository.createCareEntry(context, {
        localDate: dates[0],
        arrangementTaskId: "arrangement_task_other_workspace",
        taskKey: "custom",
        taskLabel: "Invalid task",
        childIds: firstTask.childIds,
        caregiverIds: [settings.caregivers[0].id],
        status: "completed",
        occurredAt: `${dates[0]}T14:00:00.000Z`,
      }),
    ).rejects.toThrow("INVALID_ARRANGEMENT_TASK");

    const originalRevisionId = created[0].currentRevisionId;
    const updated = await repository.updateSpecialArrangement(context, {
      recordId: created[0].id,
      title: "Camping weekend updated",
      status: "active",
      assignments,
      tasks: created[0].tasks.map((task) => ({
        id: task.id,
        sourceRoutineItemId: task.sourceRoutineItemId,
        taskKey: task.taskKey,
        childId: task.childId,
        label: task.label,
        suggestedTime: task.suggestedTime,
      })),
    });
    expect(updated.currentRevisionId).toBe(originalRevisionId);

    await repository.finalizeDailyLog(context, dates[0]);
    await expect(
      repository.updateSpecialArrangement(context, {
        recordId: created[0].id,
        title: "Direct edit should fail",
        status: "active",
        assignments,
        tasks: updated.tasks,
      }),
    ).rejects.toThrow("DAY_FINALIZED");
    const correction = await repository.correctSpecialArrangement(context, {
      recordId: created[0].id,
      title: "Corrected camping weekend",
      status: "active",
      assignments,
      tasks: updated.tasks,
      reason: "Corrected the arrangement title.",
    });
    expect(correction.previousRevisionId).toBe(originalRevisionId);
    expect(correction.revisionNumber).toBe(2);

    await repository.updateSpecialArrangement(context, {
      recordId: created[1].id,
      title: created[1].title,
      status: "cancelled",
      assignments,
      tasks: created[1].tasks,
    });
    expect(
      (await repository.getDashboard(context, dates[1])).specialArrangement,
    ).toBeUndefined();

    await expect(
      repository.createSpecialArrangement(context, {
        title: "Overlapping plan",
        startDate: dates[2],
        endDate: dates[2],
        assignments,
        days: [{ localDate: dates[2], tasks: [] }],
      }),
    ).rejects.toThrow("ARRANGEMENT_CONFLICT");

    const report = await repository.createReport(context, {
      from: dates[0],
      to: dates[2],
      childIds: [],
      includeCare: true,
      includeAppointments: true,
      includeIncidents: true,
    });
    await repository.correctSpecialArrangement(context, {
      recordId: created[0].id,
      title: "Changed after report creation",
      status: "active",
      assignments,
      tasks: updated.tasks,
      reason: "Verify that an existing report keeps its prior snapshot.",
    });
    const source = await repository.getReportSource(context, report.id);
    expect(source?.arrangements.map((arrangement) => arrangement.id)).toEqual([
      created[0].id,
    ]);
    expect(source?.arrangements[0]).toMatchObject({
      title: "Corrected camping weekend",
      currentRevisionId: correction.id,
    });
    expect(
      source?.revisions.filter(
        (revision) => revision.recordType === "special_arrangement",
      ),
    ).toHaveLength(2);
    const artifacts = await generateEvidencePackage(source!);
    const zipFile = await getPrivateFile(artifacts.zipPathname);
    const zip = await JSZip.loadAsync(zipFile!.body);
    const manifest = JSON.parse(
      await zip.file("manifest.json")!.async("string"),
    ) as {
      schemaVersion: number;
      plannedArrangementNotice: string;
      plannedArrangements: Array<{
        currentRevisionId: string;
        title: string;
      }>;
      revisions: Array<{ id: string; sha256: string }>;
    };
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      plannedArrangementNotice:
        "Planned arrangements are context only and do not establish that care occurred.",
      plannedArrangements: [
        {
          currentRevisionId: correction.id,
          title: "Corrected camping weekend",
        },
      ],
    });
    expect(
      manifest.revisions.find((revision) => revision.id === correction.id)?.sha256,
    ).toHaveLength(64);
  });

  it("allows an owner without MFA to run an enabled hard purge and retains a content-free tombstone", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext({ ...identity, mfaEnabled: false });
    const settings = await repository.getSettings(context);
    await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: true,
      children: settings.children.map((child) => ({ id: child.id, displayName: child.displayName, birthdate: child.birthdate })),
      caregivers: settings.caregivers.map((caregiver) => ({ id: caregiver.id, displayName: caregiver.displayName, relationship: caregiver.relationship })),
      routineItems: settings.template.items.map((item) => ({ id: item.id, label: item.label, suggestedTime: item.suggestedTime, childIds: item.childIds, weekdays: item.weekdays, active: item.active })),
    });
    const entry = await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      taskKey: "custom",
      taskLabel: "Prepared snack",
      childIds: [settings.children[0].id],
      caregiverIds: [settings.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-14T12:00:00.000Z",
    });
    const tombstone = await repository.hardPurge(context, {
      recordType: "care_entry",
      recordId: entry.id,
      reason: "Created only to verify permanent deletion behavior.",
    });
    expect(tombstone.priorHashes).toHaveLength(1);
    expect(await repository.getRecordBundle(context, "care_entry", entry.id)).toBeNull();
  });
});
