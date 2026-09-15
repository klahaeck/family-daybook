import { beforeEach, describe, expect, it } from "vitest";

import {
  normalizeRoutineName,
  planRoutineRecording,
  workflowStateFor,
} from "@/lib/application/routine-recording";
import type { AgentRequestAttribution } from "@/lib/agents/types";
import type { Identity } from "@/lib/auth/identity";
import { localDateInTimezone, shiftLocalDate } from "@/lib/domain/dates";
import { canonicalJson, sha256 } from "@/lib/domain/integrity";
import { createArrangementTasksForDate } from "@/lib/domain/arrangements";
import {
  MemoryParentingRepository,
  resetMemoryRepository,
} from "@/lib/repository/memory-repository";
import type { RequestContext } from "@/lib/repository/repository";

const identity: Identity = {
  authUserId: "demo_owner",
  email: "owner@example.local",
  displayName: "Demo owner",
  mfaEnabled: true,
  demo: true,
};

function agentContext(
  context: RequestContext,
  operationId: string,
  effectiveInput: Record<string, unknown>,
  expectedDayVersion?: string,
): RequestContext {
  const agent: AgentRequestAttribution = {
    source: "mcp",
    oauthClientId: "https://approved-client.example/mcp.json",
    toolName: "record_routine_item",
    operationId,
    inputHash: sha256(canonicalJson(effectiveInput)),
    expectedDayVersion,
  };
  return { ...context, agent };
}

describe("routine recording workflow", () => {
  beforeEach(() => resetMemoryRepository());

  it("normalizes Unicode names and asks for date without materializing a day", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const logCount = globalThis.__parentingLogState!.dailyLogs.length;

    expect(normalizeRoutineName(" Bedtime · STORY! ")).toBe("bedtimestory");
    const plan = await planRoutineRecording(repository, context, {
      operationId: "18fe8e44-c229-4a2b-bb20-f89b105551a8",
      routineName: "Bedtime story",
    });

    expect(plan.result).toBe("needs_input");
    if (plan.result !== "needs_input") return;
    expect(plan.questions.map((item) => item.field)).toEqual([
      "localDate",
      "status",
    ]);
    expect(globalThis.__parentingLogState!.dailyLogs).toHaveLength(logCount);
  });

  it("shares dependent questions, creates once, and returns the existing routine slot", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const localDate = localDateInTimezone(new Date(), context.workspace.timezone);
    const operationId = "4ec8dad8-aa64-4502-8918-fb88890e7431";
    const firstPlan = await planRoutineRecording(repository, context, {
      operationId,
      localDate,
      routineName: "BEDTIME STORY",
      status: "completed",
      durationMinutes: 15,
      activityType: "Story",
      notes: "Read one chapter.",
    });

    expect(firstPlan.result).toBe("needs_input");
    if (firstPlan.result !== "needs_input") return;
    expect(firstPlan.questions.map((item) => item.field)).toEqual([
      "caregiverIds",
      "localTime",
    ]);
    expect(firstPlan.values.childIds).toHaveLength(1);
    const caregiver = (await repository.getSettings(context)).caregivers[0];
    const state = workflowStateFor(
      firstPlan,
      1,
      new Date(Date.now() + 300_000).toISOString(),
    );
    const ready = await planRoutineRecording(
      repository,
      context,
      {
        operationId,
        caregiverIds: [caregiver.id],
        localTime: "20:05",
      },
      state,
    );

    expect(ready.result).toBe("ready");
    if (ready.result !== "ready") return;
    expect(ready.mutation).toMatchObject({
      status: "completed",
      caregiverIds: [caregiver.id],
      durationMinutes: 15,
      activityType: "Story",
      notes: "Read one chapter.",
    });
    const created = await repository.createCareEntry(
      agentContext(
        context,
        operationId,
        ready.effectiveInput,
        ready.snapshot.dayVersion,
      ),
      ready.mutation,
    );
    const secondOperationId = "ff0bfe01-9ba9-4938-85b4-9f73bcf765d7";
    const existing = await repository.createCareEntry(
      agentContext(context, secondOperationId, {
        ...ready.effectiveInput,
        operationId: secondOperationId,
      }),
      ready.mutation,
    );

    expect(created.writeDisposition).toBe("created");
    expect(existing.writeDisposition).toBe("existing");
    expect(existing.id).toBe(created.id);
    expect(
      globalThis.__parentingLogState!.careEntries.filter(
        (entry) => entry.templateItemId === ready.snapshot.routineId,
      ),
    ).toHaveLength(1);
  });

  it.each(["missed", "not_applicable"] as const)(
    "defaults %s records to the scheduled time and no caregiver",
    async (status) => {
      const repository = new MemoryParentingRepository();
      const context = await repository.resolveContext(identity);
      const localDate = localDateInTimezone(new Date(), context.workspace.timezone);
      const plan = await planRoutineRecording(repository, context, {
        operationId:
          status === "missed"
            ? "d7945446-49a6-451a-80b1-849ae4ff97ba"
            : "620ca956-f946-416d-bc3a-4ec49cce83c1",
        localDate,
        routineName: "Bedtime story",
        status,
      });

      expect(plan.result).toBe("ready");
      if (plan.result !== "ready") return;
      expect(plan.mutation.caregiverIds).toEqual([]);
      expect(plan.values.localTime).toBe(plan.snapshot.suggestedTime);
    },
  );

  it("applies the same caregiver and actual-time questions to partial care", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const localDate = localDateInTimezone(new Date(), context.workspace.timezone);
    const plan = await planRoutineRecording(repository, context, {
      operationId: "464b6c2b-74d8-469d-a2cf-537daf880457",
      localDate,
      routineName: "Bedtime story",
      status: "partial",
    });

    expect(plan.result).toBe("needs_input");
    if (plan.result !== "needs_input") return;
    expect(plan.questions.map((item) => item.field)).toEqual([
      "caregiverIds",
      "localTime",
    ]);
  });

  it("requires a selected subset for a routine assigned to multiple children", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const data = globalThis.__parentingLogState!;
    const secondChild = {
      ...data.children[0],
      id: "child_second",
      displayName: "Child Two",
      sortOrder: 2,
    };
    data.children.push(secondChild);
    const bedtime = data.templates[0].items.find(
      (item) => item.taskKey === "bedtime_story",
    )!;
    bedtime.childIds.push(secondChild.id);
    const localDate = localDateInTimezone(new Date(), context.workspace.timezone);
    const plan = await planRoutineRecording(repository, context, {
      operationId: "f150c05e-3897-4ef4-8bf4-8ab8a1808bf5",
      localDate,
      routineName: "Bedtime story",
      status: "missed",
    });

    expect(plan.result).toBe("needs_input");
    if (plan.result !== "needs_input") return;
    expect(plan.questions.find((item) => item.field === "childIds")?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: data.children[0].id }),
        expect.objectContaining({ value: secondChild.id }),
      ]),
    );
  });

  it("offers date-bound candidates for an ambiguous normalized name", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const data = globalThis.__parentingLogState!;
    const bedtime = data.templates[0].items.find(
      (item) => item.taskKey === "bedtime_story",
    )!;
    data.templates[0].items.push({
      ...bedtime,
      id: "routine_second_bedtime_story",
      label: "Bedtime story",
      sortOrder: bedtime.sortOrder + 1,
    });
    const localDate = localDateInTimezone(new Date(), context.workspace.timezone);
    const plan = await planRoutineRecording(repository, context, {
      operationId: "ab5ddd03-584c-4842-9c95-073d72c0c25d",
      localDate,
      routineName: "bedtime-story",
      status: "missed",
    });

    expect(plan.result).toBe("needs_input");
    if (plan.result !== "needs_input") return;
    const routineQuestion = plan.questions.find((item) => item.field === "routineId");
    expect(routineQuestion?.choices).toHaveLength(data.templates[0].items.length);
  });

  it("rejects future dates and finalized days without an existing routine record", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const localDate = localDateInTimezone(new Date(), context.workspace.timezone);
    await expect(
      planRoutineRecording(repository, context, {
        operationId: "4785e523-c0cf-4818-bc60-c544d6ff9781",
        localDate: shiftLocalDate(localDate, 1),
        routineName: "Bedtime story",
        status: "missed",
      }),
    ).rejects.toThrow("VALIDATION_ERROR");

    await repository.finalizeDailyLog(context, localDate);
    await expect(
      planRoutineRecording(repository, context, {
        operationId: "6d88519e-4c01-48f0-ac5d-775d003c12d7",
        localDate,
        routineName: "Bedtime story",
        status: "missed",
      }),
    ).rejects.toThrow("DAY_FINALIZED");
  });

  it("rejects special-day replacements and stale routine snapshots", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const settings = await repository.getSettings(context);
    const today = localDateInTimezone(new Date(), context.workspace.timezone);
    const specialDate = shiftLocalDate(today, -1);
    await repository.createSpecialArrangement(context, {
      title: "Special day",
      startDate: specialDate,
      endDate: specialDate,
      assignments: [
        {
          childId: settings.children[0].id,
          caregiverIds: [settings.caregivers[0].id],
        },
      ],
      days: [
        {
          localDate: specialDate,
          tasks: createArrangementTasksForDate(
            specialDate,
            settings.template,
            settings.children,
          ),
        },
      ],
    });
    await expect(
      planRoutineRecording(repository, context, {
        operationId: "b44f56f6-063d-401a-8d13-aab05d39c713",
        localDate: specialDate,
        routineName: "Bedtime story",
        status: "missed",
      }),
    ).rejects.toThrow("ROUTINE_UNAVAILABLE");

    const first = await planRoutineRecording(repository, context, {
      operationId: "77f0afbc-873a-44e6-a58f-1be803430d64",
      localDate: today,
      routineName: "Bedtime story",
      status: "completed",
    });
    expect(first.result).toBe("needs_input");
    if (first.result !== "needs_input") return;
    const routine = globalThis.__parentingLogState!.templates[0].items.find(
      (item) => item.taskKey === "bedtime_story",
    )!;
    routine.label = "Changed bedtime story";
    await expect(
      planRoutineRecording(
        repository,
        context,
        {
          operationId: first.values.operationId,
          caregiverIds: [settings.caregivers[0].id],
          localTime: "20:00",
        },
        workflowStateFor(
          first,
          1,
          new Date(Date.now() + 300_000).toISOString(),
        ),
      ),
    ).rejects.toThrow("VERSION_CONFLICT");
  });
});
