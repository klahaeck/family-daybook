import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/v1")>();
  return { ...actual, apiContext: vi.fn() };
});

import { GET as getDay } from "@/app/api/v1/days/[localDate]/route";
import { POST as recordRoutine } from "@/app/api/v1/days/[localDate]/routine-records/route";
import {
  GET as getSpecialDay,
  PATCH as updateSpecialDay,
} from "@/app/api/v1/special-days/[id]/route";
import {
  apiContext,
  apiError,
  parseIfMatch,
} from "@/lib/api/v1";
import type { Identity } from "@/lib/auth/identity";
import { localDateInTimezone } from "@/lib/domain/dates";
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

function operationContext(
  context: RequestContext,
  operationId: string,
  expectedDayVersion: string,
): RequestContext {
  return {
    ...context,
    operation: {
      source: "mobile_api",
      clientKey: "mobile_api",
      operationName: "routine_record.create",
      operationId,
      inputHash: operationId,
      expectedDayVersion,
    },
  };
}

describe("mobile API contract", () => {
  beforeEach(() => {
    resetMemoryRepository();
    vi.resetAllMocks();
  });

  it("normalizes quoted If-Match values and maps version errors", async () => {
    expect(
      parseIfMatch(
        new Request("https://daybook.example", {
          headers: { "If-Match": 'W/"abc123"' },
        }),
      ),
    ).toBe("abc123");
    const response = apiError(new Error("VERSION_CONFLICT"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VERSION_CONFLICT",
        message: "The resource changed; fetch it again and retry.",
      },
    });

    const staleConfirmation = apiError(new Error("CONFIRMATION_STALE"));
    expect(staleConfirmation.status).toBe(409);
    await expect(staleConfirmation.json()).resolves.toEqual({
      error: {
        code: "VERSION_CONFLICT",
        message: "The resource changed; fetch it again and retry.",
      },
    });

    const deleting = apiError(new Error("ACCOUNT_DELETION_IN_PROGRESS"));
    expect(deleting.status).toBe(409);
    await expect(deleting.json()).resolves.toMatchObject({
      error: { code: "ACCOUNT_DELETION_IN_PROGRESS" },
    });
  });

  it("returns a versioned day with private no-store headers", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    vi.mocked(apiContext).mockResolvedValue({ repository, context });
    const localDate = localDateInTimezone(new Date(), context.workspace.timezone);

    const response = await getDay(
      new Request(`https://daybook.example/api/v1/days/${localDate}`),
      { params: Promise.resolve({ localDate }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/);
    await expect(response.json()).resolves.toMatchObject({
      data: { localDate, status: "open", dayVersion: expect.any(String) },
    });
  });

  it("creates one routine slot and reports a later distinct operation as existing", async () => {
    const repository = new MemoryParentingRepository();
    const baseContext = await repository.resolveContext(identity);
    const localDate = localDateInTimezone(
      new Date(),
      baseContext.workspace.timezone,
    );
    const dashboard = await repository.getDashboard(baseContext, localDate);
    const routine = dashboard.tasks.find(
      (task) => task.source === "routine" && !task.entry,
    )!;
    const caregiver = dashboard.caregivers.find((item) => item.active)!;
    const makeRequest = (operationId: string, dayVersion: string) =>
      new Request(
        `https://daybook.example/api/v1/days/${localDate}/routine-records`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": operationId,
            "If-Match": `"${dayVersion}"`,
          },
          body: JSON.stringify({
            routineId: routine.templateItemId,
            status: "completed",
            childIds: routine.childIds,
            caregiverIds: [caregiver.id],
            localTime: routine.suggestedTime,
          }),
        },
      );

    const firstVersion = await repository.getDayVersion(baseContext, localDate);
    vi.mocked(apiContext).mockResolvedValueOnce({
      repository,
      context: operationContext(
        baseContext,
        "11223344-5566-4788-9900-aabbccddeeff",
        firstVersion,
      ),
    });
    const first = await recordRoutine(
      makeRequest("11223344-5566-4788-9900-aabbccddeeff", firstVersion),
      { params: Promise.resolve({ localDate }) },
    );
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toMatchObject({
      data: { result: "created", recordVersion: expect.any(String) },
    });

    vi.mocked(apiContext).mockResolvedValueOnce({
      repository,
      context: operationContext(
        baseContext,
        "11223344-5566-4788-9900-aabbccddeeff",
        firstVersion,
      ),
    });
    const firstReplay = await recordRoutine(
      makeRequest("11223344-5566-4788-9900-aabbccddeeff", firstVersion),
      { params: Promise.resolve({ localDate }) },
    );
    expect(firstReplay.status).toBe(201);
    await expect(firstReplay.json()).resolves.toMatchObject({
      data: { result: "created", recordVersion: expect.any(String) },
    });

    const secondVersion = await repository.getDayVersion(baseContext, localDate);
    vi.mocked(apiContext).mockResolvedValueOnce({
      repository,
      context: operationContext(
        baseContext,
        "22334455-6677-4889-9011-bbccddeeff00",
        secondVersion,
      ),
    });
    const second = await recordRoutine(
      makeRequest("22334455-6677-4889-9011-bbccddeeff00", secondVersion),
      { params: Promise.resolve({ localDate }) },
    );
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({
      data: { result: "already_recorded", recordVersion: expect.any(String) },
    });
  });

  it("uses special-day revision hashes and replays before checking versions", async () => {
    const repository = new MemoryParentingRepository();
    const baseContext = await repository.resolveContext(identity);
    const settings = await repository.getSettings(baseContext);
    const localDate = "2026-01-15";
    const assignments = [
      {
        childId: settings.children[0].id,
        caregiverIds: [settings.caregivers[0].id],
      },
    ];
    const [created] = await repository.createSpecialArrangement(baseContext, {
      title: "School conference",
      startDate: localDate,
      endDate: localDate,
      assignments,
      days: [
        {
          localDate,
          tasks: [
            {
              taskKey: "custom",
              childId: settings.children[0].id,
              label: "Conference pickup",
              suggestedTime: "15:00",
            },
          ],
        },
      ],
    });
    const before = await repository.getSpecialArrangement(
      baseContext,
      created.id,
    );
    expect(before?.recordVersion).toMatch(/^[a-f0-9]{64}$/);
    const body = {
      title: "School conference updated",
      status: "active" as const,
      assignments,
      tasks: created.tasks,
    };
    const operationId = "33445566-7788-4990-a122-ccddeeff0011";
    const operation = operationContext(
      baseContext,
      operationId,
      "unused-day-version",
    );
    operation.operation = {
      ...operation.operation!,
      operationName: "special_day.update",
      inputHash: operationId,
      expectedDayVersion: undefined,
      expectedRecordVersion: before!.recordVersion,
    };
    const request = (
      idempotencyKey = operationId,
      version = before!.recordVersion,
    ) =>
      new Request(`https://daybook.example/api/v1/special-days/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "If-Match": `"${version}"`,
        },
        body: JSON.stringify(body),
      });

    vi.mocked(apiContext).mockResolvedValueOnce({
      repository,
      context: operation,
    });
    const first = await updateSpecialDay(request(), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.data).toMatchObject({
      id: created.id,
      title: body.title,
      recordVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(first.headers.get("etag")).toBe(
      `"${firstBody.data.recordVersion}"`,
    );

    vi.mocked(apiContext).mockResolvedValueOnce({
      repository,
      context: operation,
    });
    const replay = await updateSpecialDay(request(), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(await replay.json()).toEqual(firstBody);
    expect(replay.headers.get("etag")).toBe(first.headers.get("etag"));

    vi.mocked(apiContext).mockResolvedValueOnce({
      repository,
      context: baseContext,
    });
    const read = await getSpecialDay(
      new Request(`https://daybook.example/api/v1/special-days/${created.id}`),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(read.headers.get("etag")).toBe(first.headers.get("etag"));

    const staleOperationId = "44556677-8899-4aa1-b233-ddeeff001122";
    vi.mocked(apiContext).mockResolvedValueOnce({
      repository,
      context: {
        ...baseContext,
        operation: {
          source: "mobile_api",
          clientKey: "mobile_api",
          operationName: "special_day.update",
          operationId: staleOperationId,
          inputHash: staleOperationId,
          expectedRecordVersion: before!.recordVersion,
        },
      },
    });
    const stale = await updateSpecialDay(
      request(staleOperationId, before!.recordVersion),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "VERSION_CONFLICT" },
    });
  });
});
