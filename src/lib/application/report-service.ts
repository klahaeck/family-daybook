import "server-only";

import type { ReportInput } from "@/lib/domain/schemas";
import type { ReportSnapshot } from "@/lib/domain/types";
import {
  generateEvidencePackage,
  type GeneratedEvidencePackage,
} from "@/lib/reporting/generate-package";
import type {
  ParentingRepository,
  RequestContext,
} from "@/lib/repository/repository";
import { deletePrivateFiles } from "@/lib/storage/private-files";
import { generateReportWorkflow } from "@/workflows/generate-report";

interface ReportServiceDependencies {
  useWorkflow?: boolean;
  startWorkflow?: (input: {
    context: RequestContext;
    reportId: string;
  }) => Promise<{ runId: string }>;
  generatePackage?: (
    source: NonNullable<
      Awaited<ReturnType<ParentingRepository["getReportSource"]>>
    >,
  ) => Promise<GeneratedEvidencePackage>;
  deleteFiles?: (pathnames: string[]) => Promise<void>;
}

async function defaultStartWorkflow(input: {
  context: RequestContext;
  reportId: string;
}) {
  const { start } = await import("workflow/api");
  const run = await start(generateReportWorkflow, [input]);
  return { runId: run.runId };
}

async function currentReport(
  repository: ParentingRepository,
  context: RequestContext,
  reportId: string,
) {
  return (await repository.getReports(context)).find(
    (item) => item.id === reportId,
  );
}

export async function createReportPackage(
  repository: ParentingRepository,
  context: RequestContext,
  input: ReportInput,
  dependencies: ReportServiceDependencies = {},
) {
  const replay = await repository.getOperationResult<ReportSnapshot>(context);
  let report: ReportSnapshot;
  if (replay.found) {
    const current = (await repository.getReports(context)).find(
      (item) => item.id === replay.result.id,
    );
    report = current ?? replay.result;
  } else {
    report = await repository.createReport(context, input);
  }
  if (report.status === "ready") {
    return {
      report,
      reportId: report.id,
      workflowRunId: report.workflowRunId,
    };
  }

  report = await repository.retryReportGeneration(context, report.id);
  if (report.status === "ready" || report.workflowRunId) {
    return {
      report,
      reportId: report.id,
      workflowRunId: report.workflowRunId,
    };
  }

  try {
    if (dependencies.useWorkflow ?? Boolean(process.env.VERCEL)) {
      const run = await (dependencies.startWorkflow ?? defaultStartWorkflow)({
        context,
        reportId: report.id,
      });
      report = await repository.markReportScheduled(
        context,
        report.id,
        run.runId,
      );
      return { report, reportId: report.id, workflowRunId: report.workflowRunId };
    }

    const source = await repository.getReportSource(context, report.id);
    if (!source) throw new Error("REPORT_NOT_FOUND");
    const artifacts = await (
      dependencies.generatePackage ?? generateEvidencePackage
    )(source);
    try {
      await repository.markReportReady(context, report.id, {
        manifestHash: artifacts.manifestHash,
        pdfPathname: artifacts.pdfPathname,
        zipPathname: artifacts.zipPathname,
      });
    } catch (error) {
      await (dependencies.deleteFiles ?? deletePrivateFiles)(
        artifacts.createdPathnames,
      ).catch(() => undefined);
      throw error;
    }
    report = (await currentReport(repository, context, report.id)) ?? report;
    return { report, reportId: report.id, workflowRunId: report.workflowRunId };
  } catch (error) {
    await repository
      .markReportFailed(
        context,
        report.id,
        error instanceof Error ? error.message : "Report generation failed",
      )
      .catch(() => undefined);
    throw error;
  }
}
