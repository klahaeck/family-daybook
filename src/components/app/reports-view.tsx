"use client";

import { useQuery } from "@tanstack/react-query";
import { Archive, Download, FileCheck2, Loader2 } from "lucide-react";

import { ReportDialog } from "@/components/forms/report-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/domain/dates";
import { fetchReports } from "@/lib/fetchers";
import type { Child, ReportSnapshot, Workspace } from "@/lib/domain/types";

export function ReportsView({ initialData, childOptions, workspace, canCreate }: { initialData: ReportSnapshot[]; childOptions: Child[]; workspace: Workspace; canCreate: boolean }) {
  const { data } = useQuery({ queryKey: ["reports"], queryFn: fetchReports, initialData, refetchInterval: (query) => query.state.data?.some((report) => report.status === "pending") ? 4000 : false });
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">New reports include a chart-based overview PDF and a detailed Excel workbook inside the evidence ZIP. Review all events together or use individual child tabs.</p>
      {canCreate && <div className="flex justify-end"><ReportDialog childOptions={childOptions} timezone={workspace.timezone} /></div>}
      <div className="space-y-4">
        {data.map((report) => (
          <Card key={report.id}>
            <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground">{report.status === "pending" ? <Loader2 className="size-5 animate-spin" /> : <FileCheck2 className="size-5" />}</span>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{report.filters.from} — {report.filters.to}</h2><Badge variant={report.status === "ready" ? "default" : report.status === "failed" ? "destructive" : "secondary"} className="capitalize">{report.status}</Badge></div>
                  <p className="mt-1 text-sm text-muted-foreground">Generated {formatDateTime(report.createdAt, workspace.timezone)} · {report.recordRevisionIds.length} revisions · {report.attachmentIds.length} files</p>
                  {report.manifestHash && <p className="mt-2 max-w-xl truncate font-mono text-[10px] text-muted-foreground">Manifest SHA-256: {report.manifestHash}</p>}
                  {report.error && <p className="mt-2 text-sm text-destructive">{report.error}</p>}
                </div>
              </div>
              {report.status === "ready" && <div className="flex gap-2"><a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/reports/${report.id}/download?format=pdf`}><Download className="size-4" /> PDF</a><a className={buttonVariants({ size: "sm" })} href={`/api/reports/${report.id}/download?format=zip`}><Archive className="size-4" /> Evidence ZIP</a></div>}
            </CardContent>
          </Card>
        ))}
        {data.length === 0 && <Card className="border-dashed"><CardContent className="p-12 text-center"><FileCheck2 className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No report snapshots yet</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Create an overview PDF with charts and a detailed Excel workbook with All Events and individual child tabs. Both are included in the evidence ZIP.</p></CardContent></Card>}
      </div>
    </div>
  );
}
