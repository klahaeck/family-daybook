"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Quote, ShieldCheck } from "lucide-react";

import { CorrectionDialog } from "@/components/forms/correction-dialog";
import { IncidentAttachmentsDialog } from "@/components/forms/incident-attachments-dialog";
import { IncidentDialog } from "@/components/forms/incident-dialog";
import { PurgeDialog } from "@/components/forms/purge-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  attachmentTypeLabel,
  formatAttachmentSize,
  MAX_ATTACHMENTS_PER_RECORD,
} from "@/lib/domain/attachments";
import { INCIDENT_LABELS } from "@/lib/domain/constants";
import { formatDateTime } from "@/lib/domain/dates";
import { fetchIncidents } from "@/lib/fetchers";
import type { Child, IncidentsData, Workspace } from "@/lib/domain/types";

export function IncidentsView({
  initialData,
  childOptions,
  workspace,
  canManage,
  canPurge,
}: {
  initialData: IncidentsData;
  childOptions: Child[];
  workspace: Workspace;
  canManage: boolean;
  canPurge: boolean;
}) {
  const { data } = useQuery({ queryKey: ["incidents"], queryFn: fetchIncidents, initialData });
  return (
    <div className="space-y-5">
      {canManage && <div className="flex justify-end"><IncidentDialog childOptions={childOptions} /></div>}
      <div className="space-y-4">
        {data.incidents.map((incident) => {
          const attachments = data.attachments.filter(
            (attachment) => attachment.recordId === incident.id,
          );
          const remainingSlots = Math.max(
            0,
            MAX_ATTACHMENTS_PER_RECORD - attachments.length,
          );
          return (
            <Card key={incident.id}>
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-900"><ShieldCheck className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{INCIDENT_LABELS[incident.category]}</Badge><span className="text-xs text-muted-foreground">Occurred {formatDateTime(incident.occurredAt, workspace.timezone)}</span></div>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{incident.observations}</p>
                    {incident.exactQuotes && <blockquote className="mt-4 flex gap-3 rounded-xl bg-muted/60 p-4 text-sm italic"><Quote className="size-4 shrink-0 text-muted-foreground" />{incident.exactQuotes}</blockquote>}
                    {(incident.immediateActions || incident.outcome) && <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">{incident.immediateActions && <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Immediate actions</p><p className="mt-1 text-sm">{incident.immediateActions}</p></div>}{incident.outcome && <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcome</p><p className="mt-1 text-sm">{incident.outcome}</p></div>}</div>}
                    {attachments.length > 0 && (
                      <div className="mt-4 border-t pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supporting files</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {attachments.map((attachment) => (
                            <a
                              key={attachment.id}
                              href={`/api/attachments/${attachment.id}`}
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                              <Download className="size-3.5" />
                              <span className="max-w-64 truncate">{attachment.originalName}</span>
                              <span className="text-xs text-muted-foreground">
                                {attachmentTypeLabel(attachment.contentType)} · {formatAttachmentSize(attachment.size)}
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap justify-end gap-1">
                      {canManage && remainingSlots > 0 && (
                        <IncidentAttachmentsDialog
                          recordId={incident.id}
                          remainingSlots={remainingSlots}
                        />
                      )}
                      {canManage && <CorrectionDialog recordType="incident" recordId={incident.id} currentText={incident.observations} />}
                      {canPurge && <PurgeDialog recordType="incident" recordId={incident.id} triggerLabel="Remove incident" />}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {data.incidents.length === 0 && <Card className="border-dashed"><CardContent className="p-12 text-center"><ShieldCheck className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No incidents recorded</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">When needed, document observable facts, exact words, context, and response without diagnostic conclusions.</p></CardContent></Card>}
      </div>
    </div>
  );
}
