import { beforeEach, describe, expect, it } from "vitest";

import { createDaybookService } from "@/lib/application/daybook-service";
import type { OperationRequestAttribution } from "@/lib/agents/types";
import type { Identity } from "@/lib/auth/identity";
import { localDateInTimezone, localDateTimeToUtc } from "@/lib/domain/dates";
import { canonicalJson, sha256 } from "@/lib/domain/integrity";
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
  toolName: string,
  operationId: string,
  input: Record<string, unknown>,
  versions: Partial<
    Pick<
      OperationRequestAttribution,
      "expectedRecordVersion" | "expectedDayVersion"
    >
  > = {},
): RequestContext {
  return {
    ...context,
    agent: {
      oauthClientId: "https://approved-client.example/mcp.json",
    },
    operation: {
      source: "mcp",
      clientKey: "https://approved-client.example/mcp.json",
      operationName: toolName,
      operationId,
      inputHash: sha256(canonicalJson(input)),
      ...versions,
    },
  };
}

describe("authorized daybook service", () => {
  beforeEach(() => resetMemoryRepository());

  it("returns only the non-sensitive references agents need", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const result = await createDaybookService(repository, context).getContext();
    const serialized = JSON.stringify(result);

    expect(result.role).toBe("owner");
    expect(result.timezone).toBe(context.workspace.timezone);
    expect(result.children).not.toHaveLength(0);
    expect(result.caregivers).not.toHaveLength(0);
    expect(result.children[0]).toEqual({
      childId: expect.any(String),
      displayName: expect.any(String),
    });
    expect(result.caregivers[0]).toEqual({
      caregiverId: expect.any(String),
      displayName: expect.any(String),
      relationship: expect.any(String),
    });
    expect(serialized).not.toContain("birthdate");
    expect(serialized).not.toContain("email");
  });

  it("replays the same mutation and rejects operation ID reuse", async () => {
    const repository = new MemoryParentingRepository();
    const base = await repository.resolveContext(identity);
    const today = localDateInTimezone(new Date(), base.workspace.timezone);
    const dashboard = await repository.getDashboard(base, today);
    const input = {
      operationId: "8ed485d0-e1db-4a3a-bddf-cec1c95d021c",
      localDate: today,
      source: { kind: "custom" as const, label: "Packed school snack" },
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed" as const,
      occurredAt: localDateTimeToUtc(`${today}T12:00`, base.workspace.timezone),
      notes: "Packed sliced fruit.",
    };
    const context = agentContext(
      base,
      "create_care_entry",
      input.operationId,
      input,
    );
    const service = createDaybookService(repository, context);

    const first = await service.createCareEntry(input);
    const replay = await service.createCareEntry(input);
    expect(replay.id).toBe(first.id);
    expect(first.createdBy).toBe(base.member.id);
    expect(
      globalThis.__parentingLogState?.auditEvents.find(
        (event) => event.targetId === first.id,
      )?.metadata,
    ).toMatchObject({
      source: "mcp",
      clientKey: context.operation!.clientKey,
      oauthClientId: context.agent!.oauthClientId,
      operationId: input.operationId,
      operationName: "create_care_entry",
      toolName: "create_care_entry",
    });

    const changed = { ...input, notes: "Packed crackers." };
    await expect(
      createDaybookService(
        repository,
        agentContext(
          base,
          "create_care_entry",
          input.operationId,
          changed,
        ),
      ).createCareEntry(changed),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("replays mobile operations without MCP attribution", async () => {
    const repository = new MemoryParentingRepository();
    const base = await repository.resolveContext(identity);
    const today = localDateInTimezone(new Date(), base.workspace.timezone);
    const dashboard = await repository.getDashboard(base, today);
    const input = {
      localDate: today,
      source: { kind: "custom" as const, label: "Mobile snack" },
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed" as const,
      occurredAt: localDateTimeToUtc(`${today}T12:30`, base.workspace.timezone),
    };
    const context: RequestContext = {
      ...base,
      operation: {
        source: "mobile_api",
        clientKey: "ios:com.myfamilydaybook.app",
        operationName: "create_care_entry",
        operationId: "b35689c6-5e77-45c7-a118-680d5322aa71",
        inputHash: sha256(canonicalJson(input)),
      },
    };

    const service = createDaybookService(repository, context);
    const first = await service.createCareEntry(input);
    const replay = await service.createCareEntry(input);

    expect(replay).toEqual(first);
    expect(context.agent).toBeUndefined();
    expect(
      globalThis.__parentingLogState?.agentOperations.find(
        (receipt) => receipt.operationId === context.operation!.operationId,
      ),
    ).toMatchObject({
      source: "mobile_api",
      clientKey: "ios:com.myfamilydaybook.app",
      operationName: "create_care_entry",
      operationKey: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(
      globalThis.__parentingLogState?.auditEvents.find(
        (event) => event.targetId === first.id,
      )?.metadata,
    ).toMatchObject({
      source: "mobile_api",
      clientKey: "ios:com.myfamilydaybook.app",
      operationName: "create_care_entry",
    });
  });

  it("replays legacy MCP receipts during the compatibility window", async () => {
    const repository = new MemoryParentingRepository();
    const base = await repository.resolveContext(identity);
    const input = { operationId: "8cbf385e-2947-48aa-91fd-37ee343742a6" };
    const context = agentContext(
      base,
      "update_day_notes",
      input.operationId,
      input,
    );
    const result = { localDate: "2026-09-14", status: "open" as const };
    globalThis.__parentingLogState!.agentOperations.push({
      id: "agent_operation_legacy",
      workspaceId: base.workspace.id,
      memberId: base.member.id,
      oauthClientId: context.agent!.oauthClientId,
      operationId: input.operationId,
      toolName: context.operation!.operationName,
      inputHash: context.operation!.inputHash,
      result,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(repository.getOperationResult(context)).resolves.toEqual({
      found: true,
      result,
    });
  });

  it("rejects new care entries on a finalized day", async () => {
    const repository = new MemoryParentingRepository();
    const base = await repository.resolveContext(identity);
    const today = localDateInTimezone(new Date(), base.workspace.timezone);
    const dashboard = await repository.getDashboard(base, today);
    await repository.finalizeDailyLog(base, today);
    const before = globalThis.__parentingLogState!.careEntries.length;

    await expect(
      createDaybookService(repository, base).createCareEntry({
        localDate: today,
        source: { kind: "custom", label: "Too late" },
        childIds: [dashboard.children[0].id],
        caregiverIds: [dashboard.caregivers[0].id],
        status: "completed",
        occurredAt: localDateTimeToUtc(
          `${today}T12:45`,
          base.workspace.timezone,
        ),
      }),
    ).rejects.toThrow("DAY_FINALIZED");
    expect(globalThis.__parentingLogState!.careEntries).toHaveLength(before);
  });

  it("derives routine identity and label instead of trusting caller text", async () => {
    const repository = new MemoryParentingRepository();
    const base = await repository.resolveContext(identity);
    const today = localDateInTimezone(new Date(), base.workspace.timezone);
    const dashboard = await repository.getDashboard(base, today);
    const routine = dashboard.tasks.find((task) => task.source === "routine")!;
    const input = {
      operationId: "4ade95c1-908c-481f-b1b0-27fc32471935",
      localDate: today,
      source: { kind: "routine" as const, templateItemId: routine.templateItemId! },
      taskKey: "custom",
      taskLabel: "Caller-controlled label",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed" as const,
      occurredAt: localDateTimeToUtc(`${today}T14:00`, base.workspace.timezone),
    };
    const created = await createDaybookService(
      repository,
      agentContext(base, "create_care_entry", input.operationId, input),
    ).createCareEntry(input);

    expect(created).toMatchObject({
      templateItemId: routine.templateItemId,
      taskKey: routine.taskKey,
      taskLabel: routine.label,
    });
  });

  it("enforces record versions and one-time finalization confirmations", async () => {
    const repository = new MemoryParentingRepository();
    const base = await repository.resolveContext(identity);
    const today = localDateInTimezone(new Date(), base.workspace.timezone);
    const dashboard = await repository.getDashboard(base, today);
    const createInput = {
      operationId: "e31c6863-aad6-4b36-a343-bb7827cded4d",
      localDate: today,
      source: { kind: "custom" as const, label: "Read together" },
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed" as const,
      occurredAt: localDateTimeToUtc(`${today}T13:00`, base.workspace.timezone),
    };
    const created = await createDaybookService(
      repository,
      agentContext(
        base,
        "create_care_entry",
        createInput.operationId,
        createInput,
      ),
    ).createCareEntry(createInput);
    const before = await createDaybookService(repository, base).getCareEntry(
      created.id,
    );
    const updateInput = {
      operationId: "30fac6a0-66f6-4117-872c-a87c09ee3654",
      recordVersion: before.recordVersion,
      recordId: created.id,
      childIds: created.childIds,
      caregiverIds: created.caregiverIds,
      status: "completed" as const,
      occurredAt: created.occurredAt,
      durationMinutes: 20,
    };
    await createDaybookService(
      repository,
      agentContext(base, "update_care_entry", updateInput.operationId, updateInput, {
        expectedRecordVersion: before.recordVersion,
      }),
    ).updateCareEntry(updateInput);

    const staleInput = {
      ...updateInput,
      operationId: "9666917d-b75f-4a4c-ab15-b128c44f40cc",
      durationMinutes: 25,
    };
    await expect(
      createDaybookService(
        repository,
        agentContext(base, "update_care_entry", staleInput.operationId, staleInput, {
          expectedRecordVersion: before.recordVersion,
        }),
      ).updateCareEntry(staleInput),
    ).rejects.toThrow("VERSION_CONFLICT");

    const day = await createDaybookService(repository, base).getDay(today);
    const previewInput = {
      localDate: today,
      dayVersion: day.dayVersion,
      operationId: "23fd1682-6f4f-4cc7-89bd-ad33cc02de3f",
    };
    const preview = await createDaybookService(
      repository,
      agentContext(
        base,
        "preview_day_finalization",
        previewInput.operationId,
        previewInput,
        { expectedDayVersion: day.dayVersion },
      ),
    ).previewDayFinalization(today);
    const previewReceipt = globalThis.__parentingLogState?.agentOperations.find(
      (receipt) => receipt.operationId === previewInput.operationId,
    );
    expect(previewReceipt?.result).not.toHaveProperty("confirmationHandle");

    const confirmInput = {
      confirmationHandle: preview.confirmationHandle,
      operationId: "af87bcf3-a63c-481c-b707-bdf38051f737",
    };
    const confirming = createDaybookService(
      repository,
      agentContext(
        base,
        "confirm_day_finalization",
        confirmInput.operationId,
        confirmInput,
      ),
    );
    const finalized = await confirming.confirmDayFinalization(
      preview.confirmationHandle,
    );
    expect(finalized.status).toBe("finalized");
    await expect(
      createDaybookService(
        repository,
        agentContext(
          base,
          "preview_day_finalization",
          previewInput.operationId,
          previewInput,
          { expectedDayVersion: day.dayVersion },
        ),
      ).previewDayFinalization(today, day.dayVersion),
    ).resolves.toEqual(preview);
    await expect(
      confirming.confirmDayFinalization(preview.confirmationHandle),
    ).resolves.toMatchObject({ status: "finalized" });

    const reuseInput = {
      ...confirmInput,
      operationId: "03a8ce16-d2c9-4208-a84e-ece12c5eca84",
    };
    await expect(
      createDaybookService(
        repository,
        agentContext(
          base,
          "confirm_day_finalization",
          reuseInput.operationId,
          reuseInput,
        ),
      ).confirmDayFinalization(preview.confirmationHandle),
    ).rejects.toThrow("CONFIRMATION_EXPIRED");

    const finalizedEntry = await createDaybookService(
      repository,
      base,
    ).getCareEntry(created.id);
    const correctionInput = {
      operationId: "107cf40b-19e7-45bd-879d-a39f3189dd0e",
      recordVersion: finalizedEntry.recordVersion,
      recordId: created.id,
      childIds: created.childIds,
      caregiverIds: created.caregiverIds,
      status: "completed" as const,
      occurredAt: created.occurredAt,
      durationMinutes: 25,
      notes: "Read two chapters together.",
      reason: "Added the duration and a more precise factual note.",
    };
    const correctionPreview = await createDaybookService(
      repository,
      agentContext(
        base,
        "preview_care_entry_correction",
        correctionInput.operationId,
        correctionInput,
        { expectedRecordVersion: finalizedEntry.recordVersion },
      ),
    ).previewCareEntryCorrection(correctionInput);
    expect(correctionPreview.diff.map((change) => change.field)).toEqual(
      expect.arrayContaining(["durationMinutes", "notes"]),
    );

    const correctionConfirmInput = {
      confirmationHandle: correctionPreview.confirmationHandle,
      operationId: "72382650-2d50-4670-b38a-4578431db75a",
    };
    const wrongClientContext = agentContext(
      base,
      "confirm_care_entry_correction",
      correctionConfirmInput.operationId,
      correctionConfirmInput,
    );
    wrongClientContext.agent!.oauthClientId =
      "https://different-client.example/mcp.json";
    await expect(
      createDaybookService(repository, wrongClientContext).confirmCareEntryCorrection(
        correctionPreview.confirmationHandle,
      ),
    ).rejects.toThrow("CONFIRMATION_EXPIRED");

    const correction = await createDaybookService(
      repository,
      agentContext(
        base,
        "confirm_care_entry_correction",
        correctionConfirmInput.operationId,
        correctionConfirmInput,
      ),
    ).confirmCareEntryCorrection(correctionPreview.confirmationHandle);
    expect(correction.recordVersion).not.toBe(finalizedEntry.recordVersion);
    await expect(
      createDaybookService(repository, base).getCareEntry(created.id),
    ).resolves.toMatchObject({
      record: { durationMinutes: 25, notes: "Read two chapters together." },
      revisions: [{ revisionNumber: 1 }, { revisionNumber: 2 }],
    });
  });

  it("hides open care days from reviewers at the shared repository boundary", async () => {
    const repository = new MemoryParentingRepository();
    const owner = await repository.resolveContext(identity);
    const today = localDateInTimezone(new Date(), owner.workspace.timezone);
    await repository.getDashboard(owner, today);
    const reviewer = await repository.inviteReviewer(owner, {
      email: "reviewer@example.test",
      displayName: "Reviewer",
    });
    reviewer.status = "active";
    reviewer.authUserId = "reviewer_auth";
    const reviewerContext = await repository.resolveContext({
      ...identity,
      authUserId: reviewer.authUserId,
      email: reviewer.email,
    });

    await expect(repository.getDashboard(reviewerContext, today)).rejects.toThrow(
      "NOT_FOUND",
    );
    await repository.finalizeDailyLog(owner, today);
    await expect(repository.getDashboard(reviewerContext, today)).resolves.toMatchObject(
      { dailyLog: { status: "finalized" } },
    );
    await expect(
      repository.updateDailyLogNotes(reviewerContext, {
        localDate: today,
        notes: "A reviewer cannot write this.",
      }),
    ).rejects.toThrow("FORBIDDEN");

    await repository.revokeReviewer(owner, reviewer.id);
    await expect(
      repository.resolveContext({
        ...identity,
        authUserId: reviewer.authUserId,
        email: reviewer.email,
        demo: false,
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("separates reviewer identity deletion from owner workspace deletion", async () => {
    const repository = new MemoryParentingRepository();
    const owner = await repository.resolveContext(identity);
    const data = globalThis.__parentingLogState!;
    const sourceEntry = data.careEntries[0]!;
    data.attachments.push({
      id: "attachment_delete_test",
      workspaceId: owner.workspace.id,
      recordType: "care_entry",
      recordId: sourceEntry.id,
      revisionId: sourceEntry.currentRevisionId,
      originalName: "evidence.pdf",
      contentType: "application/pdf",
      size: 128,
      sha256: "a".repeat(64),
      pathname: "private/delete-test/evidence.pdf",
      uploadedAt: new Date().toISOString(),
      uploadedBy: owner.member.id,
    });
    data.reports.push({
      id: "report_delete_test",
      workspaceId: owner.workspace.id,
      createdBy: owner.member.id,
      createdAt: new Date().toISOString(),
      status: "ready",
      filters: {
        from: "2026-09-01",
        to: "2026-09-15",
        childIds: [],
        includeCare: true,
        includeAppointments: true,
        includeIncidents: true,
      },
      recordRevisionIds: [],
      attachmentIds: [],
      pdfPathname: "private/delete-test/report.pdf",
      zipPathname: "private/delete-test/report.zip",
    });
    const reviewer = await repository.inviteReviewer(owner, {
      email: "delete-reviewer@example.test",
      displayName: "Delete reviewer",
    });
    reviewer.status = "active";
    reviewer.authUserId = "delete_reviewer_auth";
    const reviewerContext = await repository.resolveContext({
      ...identity,
      authUserId: reviewer.authUserId,
      email: reviewer.email,
      demo: false,
    });

    await expect(repository.getAccountDeletionPaths(reviewerContext)).resolves.toEqual(
      [],
    );
    await expect(repository.deleteAccountData(reviewerContext)).resolves.toEqual({
      deletedWorkspace: false,
    });
    expect(data.members.some((member) => member.id === owner.member.id)).toBe(true);
    expect(data.members.some((member) => member.id === reviewer.id)).toBe(false);

    await expect(repository.getAccountDeletionPaths(owner)).resolves.toEqual(
      expect.arrayContaining([
        "private/delete-test/evidence.pdf",
        "private/delete-test/report.pdf",
        "private/delete-test/report.zip",
      ]),
    );
    await expect(repository.deleteAccountData(owner)).resolves.toEqual({
      deletedWorkspace: true,
    });
    expect(data.members).toHaveLength(0);
    expect(data.attachments).toHaveLength(0);
    expect(data.reports).toHaveLength(0);
    expect(data.agentOperations).toHaveLength(0);
    expect(data.agentConfirmations).toHaveLength(0);
  });
});
