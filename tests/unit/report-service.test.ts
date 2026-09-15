import { beforeEach, describe, expect, it, vi } from "vitest";

import { createReportPackage } from "@/lib/application/report-service";
import type { ReportInput } from "@/lib/domain/schemas";
import type { Identity } from "@/lib/auth/identity";
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

const input: ReportInput = {
  from: "2026-01-01",
  to: "2026-12-31",
  childIds: [],
  includeCare: true,
  includeAppointments: true,
  includeIncidents: true,
};

function operationContext(context: RequestContext): RequestContext {
  return {
    ...context,
    operation: {
      source: "mobile_api",
      clientKey: "mobile_api",
      operationName: "report.create",
      operationId: "027649a8-ae62-45bd-bff1-457c3270de80",
      inputHash: "stable-report-input",
    },
  };
}

describe("report generation recovery", () => {
  beforeEach(() => resetMemoryRepository());

  it("reschedules a committed pending report on exact operation replay", async () => {
    const repository = new MemoryParentingRepository();
    const context = operationContext(await repository.resolveContext(identity));
    const committed = await repository.createReport(context, input);
    const generatePackage = vi.fn().mockResolvedValue({
      manifestHash: "manifest",
      pdfPathname: committed.pdfPathname!,
      zipPathname: committed.zipPathname!,
      createdPathnames: [],
    });

    const result = await createReportPackage(repository, context, input, {
      useWorkflow: false,
      generatePackage,
    });

    expect(result.reportId).toBe(committed.id);
    expect(result.report.status).toBe("ready");
    expect(generatePackage).toHaveBeenCalledOnce();
    expect(await repository.getReports()).toHaveLength(1);
  });

  it("marks a failed dispatch recoverable and persists the retry run id", async () => {
    const repository = new MemoryParentingRepository();
    const context = operationContext(await repository.resolveContext(identity));
    const failedStart = vi.fn().mockRejectedValue(new Error("queue unavailable"));

    await expect(
      createReportPackage(repository, context, input, {
        useWorkflow: true,
        startWorkflow: failedStart,
      }),
    ).rejects.toThrow("queue unavailable");
    expect((await repository.getReports())[0]).toMatchObject({
      status: "failed",
      error: "queue unavailable",
    });

    const successfulStart = vi.fn().mockResolvedValue({ runId: "run_retry" });
    const retried = await createReportPackage(repository, context, input, {
      useWorkflow: true,
      startWorkflow: successfulStart,
    });

    expect(retried).toMatchObject({
      reportId: retried.report.id,
      workflowRunId: "run_retry",
      report: { status: "pending", workflowRunId: "run_retry" },
    });
    expect(successfulStart).toHaveBeenCalledOnce();
    expect(await repository.getReports()).toHaveLength(1);
  });

  it("deletes artifacts created by an attempt when ready persistence fails", async () => {
    const repository = new MemoryParentingRepository();
    const context = operationContext(await repository.resolveContext(identity));
    const deleteFiles = vi.fn().mockResolvedValue(undefined);
    const createdPathnames = ["reports/workspace/report/parenting-log.pdf"];
    vi.spyOn(repository, "markReportReady").mockRejectedValueOnce(
      new Error("ACCOUNT_DELETION_IN_PROGRESS"),
    );

    await expect(
      createReportPackage(repository, context, input, {
        useWorkflow: false,
        generatePackage: vi.fn().mockResolvedValue({
          manifestHash: "manifest",
          pdfPathname: createdPathnames[0],
          zipPathname: "reports/workspace/report/evidence-package.zip",
          createdPathnames,
        }),
        deleteFiles,
      }),
    ).rejects.toThrow("ACCOUNT_DELETION_IN_PROGRESS");

    expect(deleteFiles).toHaveBeenCalledWith(createdPathnames);
  });
});
