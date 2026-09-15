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
    const notedLog = await repository.updateDailyLogNotes(context, {
      localDate: "2026-07-14",
      notes: "School called about tomorrow's schedule.",
    });
    expect(notedLog.notes).toBe("School called about tomorrow's schedule.");
    expect(
      (await repository.getDashboard(context, "2026-07-14")).dailyLog.notes,
    ).toBe("School called about tomorrow's schedule.");
    const entry = await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      taskKey: "time_together",
      taskLabel: "Time together",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-14T12:00:00.000Z",
      durationMinutes: 30,
    });
    const bundle = await repository.getRecordBundle(context, "care_entry", entry.id);
    expect(bundle?.revisions).toHaveLength(1);
    expect(bundle?.revisions[0].hash).toHaveLength(64);

    await repository.updateCareEntry(context, {
      recordId: entry.id,
      childIds: entry.childIds,
      caregiverIds: [],
      status: "missed",
      occurredAt: "2026-07-14T12:15:00.000Z",
      notes: "The activity did not occur.",
    });
    const updatedBundle = await repository.getRecordBundle(context, "care_entry", entry.id);
    expect(updatedBundle?.record).toMatchObject({
      caregiverIds: [],
      status: "missed",
    });
    expect(
      updatedBundle?.record && "durationMinutes" in updatedBundle.record
        ? updatedBundle.record.durationMinutes
        : undefined,
    ).toBeUndefined();
    expect(updatedBundle?.revisions).toHaveLength(1);

    await repository.finalizeDailyLog(context, "2026-07-14");
    await expect(
      repository.updateDailyLogNotes(context, {
        localDate: "2026-07-14",
        notes: "Changed after finalization.",
      }),
    ).rejects.toThrow("DAY_FINALIZED");

    await repository.correctCareEntry(context, {
      recordId: entry.id,
      childIds: entry.childIds,
      caregiverIds: [],
      status: "not_applicable",
      occurredAt: "2026-07-14T12:30:00.000Z",
      notes: "The routine item did not apply.",
      reason: "Corrected the recorded outcome.",
    });
    const correctedBundle = await repository.getRecordBundle(context, "care_entry", entry.id);
    expect(correctedBundle?.record).toMatchObject({
      caregiverIds: [],
      status: "not_applicable",
      occurredAt: "2026-07-14T12:30:00.000Z",
      notes: "The routine item did not apply.",
    });
    expect(
      correctedBundle?.record && "durationMinutes" in correctedBundle.record
        ? correctedBundle.record.durationMinutes
        : undefined,
    ).toBeUndefined();
    expect(correctedBundle?.revisions).toHaveLength(2);
    expect(correctedBundle?.revisions[1].payload).toMatchObject({
      caregiverIds: [],
      status: "not_applicable",
    });
    expect(correctedBundle?.revisions[1].payload).not.toHaveProperty("durationMinutes");
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
    await repository.correctSpecialArrangement(context, {
      recordId: created.id,
      title: "Changed after report creation",
      status: "active",
      assignments,
      tasks: created.tasks,
      reason: "Verify the Mongo report snapshot is immutable.",
    });
    expect(await repository.getReportSource(context, report.id)).toEqual(source);
    const includedRevisionIds = new Set(
      source?.revisions.map((revision) => revision.id),
    );
    for (const record of source?.arrangements ?? []) {
      expect(includedRevisionIds.has(record.currentRevisionId)).toBe(true);
      expect(report.recordRevisionIds).toContain(record.currentRevisionId);
    }
  });

  it("runs the shared Daybook service with transactional operation replay", async () => {
    const [
      { MongoParentingRepository },
      { createDaybookService },
      integrity,
      { getDatabase },
    ] =
      await Promise.all([
        import("@/lib/repository/mongo-repository"),
        import("@/lib/application/daybook-service"),
        import("@/lib/domain/integrity"),
        import("@/lib/db/mongodb"),
      ]);
    const repository = new MongoParentingRepository();
    const base = await repository.resolveContext({
      authUserId: "mongo-agent-owner",
      email: "mongo-agent-owner@example.test",
      displayName: "Mongo Agent Owner",
      mfaEnabled: true,
      demo: false,
    });
    const localDate = "2026-09-14";
    const dashboard = await repository.getDashboard(base, localDate);
    const input = {
      operationId: "db0a04f7-8c16-4a85-8ea4-815210c49157",
      localDate,
      source: { kind: "custom" as const, label: "Packed lunch" },
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed" as const,
      occurredAt: "2026-09-14T17:00:00.000Z",
      notes: "Packed a sandwich and fruit.",
    };
    const context = {
      ...base,
      agent: {
        oauthClientId: "https://approved-client.example/mcp.json",
      },
      operation: {
        source: "mcp" as const,
        clientKey: "https://approved-client.example/mcp.json",
        operationName: "create_care_entry",
        operationId: input.operationId,
        inputHash: integrity.sha256(integrity.canonicalJson(input)),
      },
    };
    const service = createDaybookService(repository, context);
    const first = await service.createCareEntry(input);
    const replay = await service.createCareEntry(input);

    expect(replay).toEqual(first);
    expect(first.recordVersion).toHaveLength(64);
    expect(
      (await repository.getDashboard(base, localDate)).recentEntries.filter(
        (entry) => entry.id === first.id,
      ),
    ).toHaveLength(1);
    await expect(
      (await getDatabase()).collection("agentOperations").findOne({
        workspaceId: base.workspace.id,
        operationId: input.operationId,
      }),
    ).resolves.toMatchObject({
      source: "mcp",
      clientKey: context.operation.clientKey,
      operationName: "create_care_entry",
      operationKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      oauthClientId: context.agent.oauthClientId,
      toolName: "create_care_entry",
    });
  });

  it("creates one routine slot for concurrent distinct operation IDs", async () => {
    const [{ MongoParentingRepository }, integrity, { getDatabase }] =
      await Promise.all([
        import("@/lib/repository/mongo-repository"),
        import("@/lib/domain/integrity"),
        import("@/lib/db/mongodb"),
      ]);
    const repository = new MongoParentingRepository();
    const base = await repository.resolveContext({
      authUserId: "mongo-routine-owner",
      email: "mongo-routine-owner@example.test",
      displayName: "Mongo Routine Owner",
      mfaEnabled: true,
      demo: false,
    });
    const localDate = "2026-09-15";
    const dashboard = await repository.getDashboard(base, localDate);
    const routine = dashboard.tasks.find(
      (task) => task.source === "routine" && task.taskKey === "bedtime_story",
    )!;
    const mutation = {
      localDate,
      templateItemId: routine.templateItemId,
      taskKey: routine.taskKey,
      taskLabel: routine.label,
      childIds: routine.childIds,
      caregiverIds: [],
      status: "missed" as const,
      occurredAt: "2026-09-16T01:00:00.000Z",
    };
    const operationIds = [
      "2ce9a2ef-0e3f-4382-8172-ebbe2d705e82",
      "978577f0-9c91-46b6-bba3-595818a84a37",
    ];
    const contexts = operationIds.map((operationId) => ({
      ...base,
      agent: {
        oauthClientId: "https://approved-client.example/mcp.json",
      },
      operation: {
        source: "mcp" as const,
        clientKey: "https://approved-client.example/mcp.json",
        operationName: "record_routine_item",
        operationId,
        inputHash: integrity.sha256(
          integrity.canonicalJson({ operationId, ...mutation }),
        ),
      },
    }));

    const results = await Promise.all(
      contexts.map((context) => repository.createCareEntry(context, mutation)),
    );
    expect(results.map((result) => result.writeDisposition).sort()).toEqual([
      "created",
      "existing",
    ]);
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(
      (await repository.getDashboard(base, localDate)).recentEntries.filter(
        (entry) => entry.templateItemId === routine.templateItemId,
      ),
    ).toHaveLength(1);
    expect(
      await (await getDatabase())
        .collection("routineRecordSlots")
        .countDocuments({ workspaceId: base.workspace.id }),
    ).toBe(1);
  });

  it("rejects stale day writes while replaying a committed care operation", async () => {
    const [{ MongoParentingRepository }, integrity] = await Promise.all([
      import("@/lib/repository/mongo-repository"),
      import("@/lib/domain/integrity"),
    ]);
    const repository = new MongoParentingRepository();
    const base = await repository.resolveContext({
      authUserId: "mongo-stale-day-owner",
      email: "mongo-stale-day-owner@example.test",
      displayName: "Stale Day Owner",
      mfaEnabled: true,
      demo: false,
    });
    const localDate = "2026-09-16";
    const dashboard = await repository.getDashboard(base, localDate);
    const dayVersion = await repository.getDayVersion(base, localDate);
    const careInput = {
      localDate,
      taskKey: "custom" as const,
      taskLabel: "Packed school bag",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed" as const,
      occurredAt: "2026-09-16T13:00:00.000Z",
    };
    const firstContext = {
      ...base,
      operation: {
        source: "mobile_api" as const,
        clientKey: "family-daybook-mobile",
        operationName: "create_care_entry",
        operationId: "173e9894-7400-4f70-8f57-1f99902c34bc",
        inputHash: integrity.sha256(integrity.canonicalJson(careInput)),
        expectedDayVersion: dayVersion,
      },
    };

    const created = await repository.createCareEntry(firstContext, careInput);
    const staleUpdateInput = {
      recordId: created.id,
      childIds: created.childIds,
      caregiverIds: created.caregiverIds,
      status: created.status,
      occurredAt: created.occurredAt,
      notes: "This update used the pre-create day version.",
    };
    const staleUpdateContext = {
      ...base,
      operation: {
        source: "mobile_api" as const,
        clientKey: "family-daybook-mobile",
        operationName: "update_care_entry",
        operationId: "ad7920af-6caa-41d0-86e6-d90dc616e938",
        inputHash: integrity.sha256(
          integrity.canonicalJson(staleUpdateInput),
        ),
        expectedRecordVersion: created.recordVersion,
        expectedDayVersion: dayVersion,
      },
    };
    await expect(
      repository.updateCareEntry(staleUpdateContext, staleUpdateInput),
    ).rejects.toThrow("VERSION_CONFLICT");

    const staleInput = {
      ...careInput,
      taskLabel: "Prepared lunch",
      occurredAt: "2026-09-16T13:05:00.000Z",
    };
    const staleContext = {
      ...base,
      operation: {
        source: "mobile_api" as const,
        clientKey: "family-daybook-mobile",
        operationName: "create_care_entry",
        operationId: "fb97c20f-327a-487c-8013-d5b7a27c3ee0",
        inputHash: integrity.sha256(integrity.canonicalJson(staleInput)),
        expectedDayVersion: dayVersion,
      },
    };
    await expect(
      repository.createCareEntry(staleContext, staleInput),
    ).rejects.toThrow("VERSION_CONFLICT");

    await repository.finalizeDailyLog(base, localDate);
    await expect(
      repository.createCareEntry(firstContext, careInput),
    ).resolves.toEqual(created);
  });

  it("serializes routine recording against day finalization", async () => {
    const [{ MongoParentingRepository }, integrity] = await Promise.all([
      import("@/lib/repository/mongo-repository"),
      import("@/lib/domain/integrity"),
    ]);
    const repository = new MongoParentingRepository();
    const base = await repository.resolveContext({
      authUserId: "mongo-day-race-owner",
      email: "mongo-day-race-owner@example.test",
      displayName: "Day Race Owner",
      mfaEnabled: true,
      demo: false,
    });
    const localDate = "2026-09-17";
    const dashboard = await repository.getDashboard(base, localDate);
    const dayVersion = await repository.getDayVersion(base, localDate);
    const routine = dashboard.tasks.find(
      (task) => task.source === "routine" && task.templateItemId,
    )!;
    const careInput = {
      localDate,
      templateItemId: routine.templateItemId,
      taskKey: routine.taskKey,
      taskLabel: routine.label,
      childIds: routine.childIds,
      caregiverIds: [],
      status: "missed" as const,
      occurredAt: "2026-09-17T13:00:00.000Z",
    };
    const careContext = {
      ...base,
      operation: {
        source: "mobile_api" as const,
        clientKey: "family-daybook-mobile",
        operationName: "record_routine_item",
        operationId: "cf6c0e13-b17a-49a2-851e-3103296f1600",
        inputHash: integrity.sha256(integrity.canonicalJson(careInput)),
        expectedDayVersion: dayVersion,
      },
    };
    const finalizeContext = {
      ...base,
      operation: {
        source: "mobile_api" as const,
        clientKey: "family-daybook-mobile",
        operationName: "finalize_daily_log",
        operationId: "b7c7d54d-74b3-4f2a-a05c-5e22be143a0c",
        inputHash: integrity.sha256(integrity.canonicalJson({ localDate })),
        expectedDayVersion: dayVersion,
      },
    };

    const [careResult, finalizeResult] = await Promise.allSettled([
      repository.createCareEntry(careContext, careInput),
      repository.finalizeDailyLog(finalizeContext, localDate),
    ]);
    expect(
      [careResult, finalizeResult].filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      [careResult, finalizeResult].filter((result) => result.status === "rejected"),
    ).toHaveLength(1);

    const after = await repository.getDashboard(base, localDate);
    if (careResult.status === "fulfilled") {
      expect(after.dailyLog.status).toBe("open");
      expect(
        after.recentEntries.filter(
          (entry) => entry.templateItemId === routine.templateItemId,
        ),
      ).toHaveLength(1);
      await expect(
        repository.createCareEntry(careContext, careInput),
      ).resolves.toEqual(careResult.value);
    } else {
      if (finalizeResult.status !== "fulfilled") {
        throw finalizeResult.reason;
      }
      expect(after.dailyLog.status).toBe("finalized");
      expect(
        after.recentEntries.filter(
          (entry) => entry.templateItemId === routine.templateItemId,
        ),
      ).toHaveLength(0);
      await expect(
        repository.finalizeDailyLog(finalizeContext, localDate),
      ).resolves.toEqual(finalizeResult.value);
    }
  });

  it("serializes special-day creation against finalization", async () => {
    const [{ MongoParentingRepository }, { createArrangementTasksForDate }] =
      await Promise.all([
        import("@/lib/repository/mongo-repository"),
        import("@/lib/domain/arrangements"),
      ]);
    const repository = new MongoParentingRepository();
    const base = await repository.resolveContext({
      authUserId: "mongo-special-create-race-owner",
      email: "mongo-special-create-race-owner@example.test",
      displayName: "Special Create Race Owner",
      mfaEnabled: true,
      demo: false,
    });
    const localDate = "2026-09-18";
    const dashboard = await repository.getDashboard(base, localDate);
    const settings = await repository.getSettings(base);
    const dayVersion = await repository.getDayVersion(base, localDate);
    const assignments = settings.children.map((child) => ({
      childId: child.id,
      caregiverIds: [settings.caregivers[0].id],
    }));
    const createInput = {
      title: "School closure",
      startDate: localDate,
      endDate: localDate,
      assignments,
      days: [
        {
          localDate,
          tasks: createArrangementTasksForDate(
            localDate,
            settings.template,
            settings.children,
          ),
        },
      ],
    };
    const createContext = {
      ...base,
      operation: {
        source: "mobile_api" as const,
        clientKey: "family-daybook-mobile",
        operationName: "special_day.create",
        operationId: "0f34c94e-0823-49fd-9ea2-7fdb41a63690",
        inputHash: "create-special-day-race",
      },
    };
    const finalizeContext = {
      ...base,
      operation: {
        source: "mobile_api" as const,
        clientKey: "family-daybook-mobile",
        operationName: "finalize_daily_log",
        operationId: "3b1232e8-ff7e-47b0-be09-c0c23395e775",
        inputHash: "finalize-special-create-race",
        expectedDayVersion: dayVersion,
      },
    };

    const [createResult, finalizeResult] = await Promise.allSettled([
      repository.createSpecialArrangement(createContext, createInput),
      repository.finalizeDailyLog(finalizeContext, localDate),
    ]);
    expect(
      [createResult, finalizeResult].filter(
        (result) => result.status === "fulfilled",
      ),
    ).toHaveLength(1);

    const after = await repository.getDashboard(base, localDate);
    if (createResult.status === "fulfilled") {
      expect(after.dailyLog.status).toBe("open");
      expect(after.specialArrangement?.id).toBe(createResult.value[0].id);
      expect(await repository.getDayVersion(base, localDate)).not.toBe(
        dayVersion,
      );
      await expect(
        repository.createSpecialArrangement(createContext, createInput),
      ).resolves.toEqual(createResult.value);
    } else {
      if (finalizeResult.status !== "fulfilled") {
        throw finalizeResult.reason;
      }
      expect(after.dailyLog.status).toBe("finalized");
      expect(after.specialArrangement).toBeUndefined();
      expect(dashboard.dailyLog.id).toBe(after.dailyLog.id);
      await expect(
        repository.finalizeDailyLog(finalizeContext, localDate),
      ).resolves.toEqual(finalizeResult.value);
    }
  });

  it("serializes special-day updates with finalization and versions corrections", async () => {
    const [{ MongoParentingRepository }, { createArrangementTasksForDate }] =
      await Promise.all([
        import("@/lib/repository/mongo-repository"),
        import("@/lib/domain/arrangements"),
      ]);
    const repository = new MongoParentingRepository();
    const base = await repository.resolveContext({
      authUserId: "mongo-special-update-race-owner",
      email: "mongo-special-update-race-owner@example.test",
      displayName: "Special Update Race Owner",
      mfaEnabled: true,
      demo: false,
    });
    const localDate = "2026-09-19";
    await repository.getDashboard(base, localDate);
    const settings = await repository.getSettings(base);
    const assignments = settings.children.map((child) => ({
      childId: child.id,
      caregiverIds: [settings.caregivers[0].id],
    }));
    const [created] = await repository.createSpecialArrangement(base, {
      title: "Original special day",
      startDate: localDate,
      endDate: localDate,
      assignments,
      days: [
        {
          localDate,
          tasks: createArrangementTasksForDate(
            localDate,
            settings.template,
            settings.children,
          ),
        },
      ],
    });
    const beforeUpdate = await repository.getDayVersion(base, localDate);
    const detail = await repository.getSpecialArrangement(base, created.id);
    const updateInput = {
      recordId: created.id,
      title: "Updated special day",
      status: "active" as const,
      assignments,
      tasks: created.tasks,
    };
    const updateContext = {
      ...base,
      operation: {
        source: "mobile_api" as const,
        clientKey: "family-daybook-mobile",
        operationName: "special_day.update",
        operationId: "d0de1bf9-468e-437c-a14f-b8adbc5ea976",
        inputHash: "update-special-day-race",
        expectedRecordVersion: detail!.recordVersion,
      },
    };
    const finalizeContext = {
      ...base,
      operation: {
        source: "mobile_api" as const,
        clientKey: "family-daybook-mobile",
        operationName: "finalize_daily_log",
        operationId: "13383b15-98b6-4d58-84f7-7b5b3dfa962d",
        inputHash: "finalize-special-update-race",
        expectedDayVersion: beforeUpdate,
      },
    };

    const [updateResult, finalizeResult] = await Promise.allSettled([
      repository.updateSpecialArrangement(updateContext, updateInput),
      repository.finalizeDailyLog(finalizeContext, localDate),
    ]);
    expect(
      [updateResult, finalizeResult].filter(
        (result) => result.status === "fulfilled",
      ),
    ).toHaveLength(1);

    const afterRace = await repository.getDashboard(base, localDate);
    if (updateResult.status === "fulfilled") {
      expect(afterRace.dailyLog.status).toBe("open");
      expect(afterRace.specialArrangement?.title).toBe("Updated special day");
      expect(await repository.getDayVersion(base, localDate)).not.toBe(
        beforeUpdate,
      );
      await expect(
        repository.updateSpecialArrangement(updateContext, updateInput),
      ).resolves.toEqual(updateResult.value);
      await repository.finalizeDailyLog(base, localDate);
    } else {
      if (finalizeResult.status !== "fulfilled") {
        throw finalizeResult.reason;
      }
      expect(afterRace.dailyLog.status).toBe("finalized");
      expect(afterRace.specialArrangement?.title).toBe("Original special day");
    }

    const beforeCorrection = await repository.getDayVersion(base, localDate);
    const current = await repository.getSpecialArrangement(base, created.id);
    await repository.correctSpecialArrangement(
      {
        ...base,
        operation: {
          source: "mobile_api" as const,
          clientKey: "family-daybook-mobile",
          operationName: "special_day.correct",
          operationId: "3fd47622-fc43-4346-bc35-3fb49dc6de17",
          inputHash: "correct-special-day-after-race",
          expectedRecordVersion: current!.recordVersion,
        },
      },
      {
        recordId: created.id,
        title: "Corrected special day",
        status: "active",
        assignments,
        tasks: current!.tasks,
        reason: "Correct the title after finalization.",
      },
    );
    expect(await repository.getDayVersion(base, localDate)).not.toBe(
      beforeCorrection,
    );
  });

  it("serializes owner deletion against mutations and daily-log creation", async () => {
    const [{ MongoParentingRepository }, { getDatabase }] = await Promise.all([
      import("@/lib/repository/mongo-repository"),
      import("@/lib/db/mongodb"),
    ]);
    const repository = new MongoParentingRepository();
    const identity = {
      authUserId: "mongo-deletion-race-owner",
      email: "mongo-deletion-race-owner@example.test",
      displayName: "Deletion Race Owner",
      mfaEnabled: true,
      demo: false,
    };
    const base = await repository.resolveContext(identity);
    const mutationContext = {
      ...base,
      operation: {
        source: "mobile_api" as const,
        clientKey: "family-daybook-mobile",
        operationName: "reviewer.invite",
        operationId: "09530667-ff63-4d12-a7df-010ca0db37ca",
        inputHash: "deletion-race-invite",
      },
    };

    const [deletion, mutation, writeOnRead] = await Promise.allSettled([
      (async () => {
        await repository.beginAccountDeletion(base);
        return repository.deleteAccountData(base);
      })(),
      repository.inviteReviewer(mutationContext, {
        email: "mongo-deletion-race-reviewer@example.test",
        displayName: "Deletion Race Reviewer",
      }),
      repository.getDashboard(base, "2030-01-03"),
    ]);

    expect(deletion).toEqual({
      status: "fulfilled",
      value: { deletedWorkspace: true },
    });
    if (mutation.status === "rejected") {
      expect(String(mutation.reason)).toContain(
        "ACCOUNT_DELETION_IN_PROGRESS",
      );
    }
    if (writeOnRead.status === "rejected") {
      expect([
        "ACCOUNT_DELETION_IN_PROGRESS",
        "ROUTINE_TEMPLATE_NOT_FOUND",
      ]).toContain((writeOnRead.reason as Error).message);
    }

    const db = await getDatabase();
    await expect(
      Promise.all([
        db.collection("workspaces").countDocuments({ id: base.workspace.id }),
        db.collection("members").countDocuments({ workspaceId: base.workspace.id }),
        db.collection("dailyLogs").countDocuments({ workspaceId: base.workspace.id }),
        db.collection("auditEvents").countDocuments({ workspaceId: base.workspace.id }),
        db.collection("agentOperations").countDocuments({ workspaceId: base.workspace.id }),
      ]),
    ).resolves.toEqual([0, 0, 0, 0, 0]);
    await expect(
      db.collection("workspaceMutationFences").findOne({
        workspaceId: base.workspace.id,
      }),
    ).resolves.toMatchObject({ state: "deleting" });

    await expect(
      repository.inviteReviewer(mutationContext, {
        email: "mongo-deletion-race-reviewer@example.test",
        displayName: "Deletion Race Reviewer",
      }),
    ).rejects.toThrow("ACCOUNT_DELETION_IN_PROGRESS");
    await expect(
      repository.getDashboard(base, "2030-01-04"),
    ).rejects.toThrow("ACCOUNT_DELETION_IN_PROGRESS");
    await expect(repository.resolveContext(identity)).rejects.toThrow(
      "ACCOUNT_DELETION_IN_PROGRESS",
    );
  });

  it("fences reviewer writes and idempotency replay without deleting the workspace", async () => {
    const [{ MongoParentingRepository }, { getDatabase }] = await Promise.all([
      import("@/lib/repository/mongo-repository"),
      import("@/lib/db/mongodb"),
    ]);
    const repository = new MongoParentingRepository();
    const owner = await repository.resolveContext({
      authUserId: "mongo-reviewer-deletion-owner",
      email: "mongo-reviewer-deletion-owner@example.test",
      displayName: "Reviewer Deletion Owner",
      mfaEnabled: true,
      demo: false,
    });
    const reviewerEmail = "mongo-reviewer-deletion@example.test";
    await repository.inviteReviewer(owner, {
      email: reviewerEmail,
      displayName: "Deleting Reviewer",
    });
    const reviewerIdentity = {
      authUserId: "mongo-reviewer-deletion-subject",
      email: reviewerEmail,
      displayName: "Deleting Reviewer",
      mfaEnabled: true,
      demo: false,
    };
    const reviewer = await repository.resolveContext(reviewerIdentity);
    const replayContext = {
      ...reviewer,
      operation: {
        source: "mobile_api" as const,
        clientKey: "family-daybook-mobile",
        operationName: "attachment.download.audit",
        operationId: "10809569-7533-49b1-a874-35ce2540ef82",
        inputHash: "reviewer-download-replay",
      },
    };
    await repository.recordOperationResult(replayContext, {
      downloadAuthorized: true,
    });

    const [deletion, auditWrite] = await Promise.allSettled([
      (async () => {
        await repository.beginAccountDeletion(reviewer);
        return repository.deleteAccountData(reviewer);
      })(),
      repository.recordAuditEvent(reviewer, {
        actorId: reviewer.member.id,
        action: "downloaded",
        targetType: "attachment",
        targetId: "attachment-reviewer-race",
      }),
    ]);

    expect(deletion).toEqual({
      status: "fulfilled",
      value: { deletedWorkspace: false },
    });
    if (auditWrite.status === "rejected") {
      expect(String(auditWrite.reason)).toContain(
        "ACCOUNT_DELETION_IN_PROGRESS",
      );
    }

    await expect(repository.getOperationResult(replayContext)).rejects.toThrow(
      "ACCOUNT_DELETION_IN_PROGRESS",
    );
    await expect(
      repository.recordAuditEvent(reviewer, {
        actorId: reviewer.member.id,
        action: "downloaded",
        targetType: "attachment",
        targetId: "attachment-after-reviewer-deletion",
      }),
    ).rejects.toThrow("ACCOUNT_DELETION_IN_PROGRESS");
    await expect(repository.resolveContext(reviewerIdentity)).rejects.toThrow(
      "ACCOUNT_DELETION_IN_PROGRESS",
    );

    const db = await getDatabase();
    await expect(
      db.collection("members").countDocuments({
        id: reviewer.member.id,
        workspaceId: owner.workspace.id,
      }),
    ).resolves.toBe(0);
    await expect(
      db.collection("workspaces").countDocuments({ id: owner.workspace.id }),
    ).resolves.toBe(1);
    await expect(repository.getSettings(owner)).resolves.toBeDefined();
  });
});
