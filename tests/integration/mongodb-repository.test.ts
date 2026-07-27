import { afterAll, beforeAll, describe, expect, it } from "vitest";

const configured = Boolean(process.env.TEST_MONGODB_URI);

describe.skipIf(!configured)("MongoDB repository integration", () => {
  beforeAll(() => {
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    process.env.MONGODB_DB = `parenting_log_test_${Date.now()}`;
  });

  afterAll(async () => {
    const { getDatabase } = await import("@/lib/db/mongodb");
    await (await getDatabase()).dropDatabase();
  });

  it("bootstraps an isolated workspace and writes a transactional care revision", async () => {
    const { MongoParentingRepository } = await import("@/lib/repository/mongo-repository");
    const repository = new MongoParentingRepository();
    const context = await repository.resolveContext({
      authUserId: "mongo-owner",
      email: "mongo-owner@example.test",
      displayName: "Mongo Owner",
      mfaEnabled: true,
      demo: false,
    });
    const dashboard = await repository.getDashboard(context, "2026-07-14");
    const entry = await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      taskKey: "custom",
      taskLabel: "Prepared school materials",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-14T12:00:00.000Z",
    });
    const bundle = await repository.getRecordBundle(context, "care_entry", entry.id);
    expect(bundle?.revisions).toHaveLength(1);
    expect(bundle?.revisions[0].hash).toHaveLength(64);

    await repository.updateCareEntry(context, {
      recordId: entry.id,
      childIds: entry.childIds,
      caregiverIds: entry.caregiverIds,
      status: "partial",
      occurredAt: "2026-07-14T12:15:00.000Z",
      notes: "Updated details.",
    });
    expect((await repository.getRecordBundle(context, "care_entry", entry.id))?.revisions).toHaveLength(1);

    await repository.finalizeDailyLog(context, "2026-07-14");

    await repository.correctCareEntry(context, {
      recordId: entry.id,
      childIds: entry.childIds,
      caregiverIds: entry.caregiverIds,
      status: "partial",
      occurredAt: "2026-07-14T12:30:00.000Z",
      notes: "Corrected details.",
      reason: "Corrected the recorded outcome.",
    });
    const correctedBundle = await repository.getRecordBundle(context, "care_entry", entry.id);
    expect(correctedBundle?.record).toMatchObject({
      status: "partial",
      occurredAt: "2026-07-14T12:30:00.000Z",
      notes: "Corrected details.",
    });
    expect(correctedBundle?.revisions).toHaveLength(2);
    expect(correctedBundle?.revisions[1].payload).not.toHaveProperty("_id");

    const secondContext = await repository.resolveContext({
      authUserId: "mongo-owner-two",
      email: "mongo-owner-two@example.test",
      displayName: "Second Mongo Owner",
      mfaEnabled: true,
      demo: false,
    });
    expect(secondContext.workspace.id).not.toBe(context.workspace.id);
    expect(secondContext.member.id).not.toBe(context.member.id);
    expect(
      await repository.getRecordBundle(secondContext, "care_entry", entry.id),
    ).toBeNull();
    expect((await repository.getTimeline(secondContext)).items).toHaveLength(0);

    const resolvedAgain = await repository.resolveContext(context.identity);
    expect(resolvedAgain.workspace.id).toBe(context.workspace.id);
  });

  it("writes isolated special-arrangement days and append-only corrections", async () => {
    const { MongoParentingRepository } = await import("@/lib/repository/mongo-repository");
    const { createArrangementTasksForDate } = await import(
      "@/lib/domain/arrangements"
    );
    const repository = new MongoParentingRepository();
    const context = await repository.resolveContext({
      authUserId: "mongo-arrangement-owner",
      email: "mongo-arrangement-owner@example.test",
      displayName: "Arrangement Owner",
      mfaEnabled: true,
      demo: false,
    });
    const settings = await repository.getSettings(context);
    const localDates = ["2026-07-25", "2026-07-26"];
    const assignments = [
      {
        childId: settings.children[0].id,
        caregiverIds: [settings.caregivers[0].id],
      },
    ];
    const createdDays = await repository.createSpecialArrangement(context, {
      title: "Camping weekend",
      startDate: localDates[0],
      endDate: localDates[1],
      assignments,
      days: localDates.map((localDate) => ({
        localDate,
        tasks: createArrangementTasksForDate(
          localDate,
          settings.template,
          settings.children,
        ),
      })),
    });
    const created = createdDays[0];
    expect(createdDays).toHaveLength(2);
    expect(new Set(createdDays.map((day) => day.seriesId)).size).toBe(1);
    expect(
      (await repository.getDashboard(context, localDates[0]))
        .specialArrangement?.id,
    ).toBe(created.id);
    expect(
      (await repository.getTimeline(context)).items
        .filter((item) => createdDays.some((day) => day.id === item.id))
        .map((item) => item.kind),
    ).toEqual(["special_day", "special_day"]);

    const otherContext = await repository.resolveContext({
      authUserId: "mongo-arrangement-other-owner",
      email: "mongo-arrangement-other-owner@example.test",
      displayName: "Other Arrangement Owner",
      mfaEnabled: true,
      demo: false,
    });
    expect(
      (await repository.getSpecialArrangements(otherContext)).days,
    ).toHaveLength(0);
    await expect(
      repository.updateSpecialArrangement(otherContext, {
        recordId: created.id,
        title: created.title,
        status: "active",
        assignments,
        tasks: created.tasks,
      }),
    ).rejects.toThrow("NOT_FOUND");

    await expect(
      repository.createSpecialArrangement(context, {
        title: "Conflicting arrangement",
        startDate: "2026-07-24",
        endDate: localDates[0],
        assignments,
        days: [
          {
            localDate: "2026-07-24",
            tasks: createArrangementTasksForDate(
              "2026-07-24",
              settings.template,
              settings.children,
            ),
          },
          { localDate: localDates[0], tasks: [] },
        ],
      }),
    ).rejects.toThrow("ARRANGEMENT_CONFLICT");
    expect(
      (await repository.getSpecialArrangements(context)).days.some(
        (day) => day.localDate === "2026-07-24",
      ),
    ).toBe(false);

    await repository.finalizeDailyLog(context, localDates[0]);
    const corrected = await repository.correctSpecialArrangement(context, {
      recordId: created.id,
      title: "Corrected camping weekend",
      status: "active",
      assignments,
      tasks: created.tasks,
      reason: "Corrected the arrangement title.",
    });
    expect(corrected.previousRevisionId).toBe(created.currentRevisionId);

    const report = await repository.createReport(context, {
      from: localDates[0],
      to: localDates[0],
      childIds: [],
      includeCare: true,
      includeAppointments: true,
      includeIncidents: true,
    });
    const source = await repository.getReportSource(context, report.id);
    expect(source?.arrangements).toHaveLength(1);
    expect(
      source?.revisions.filter(
        (revision) => revision.recordType === "special_arrangement",
      ),
    ).toHaveLength(2);
  });
});
