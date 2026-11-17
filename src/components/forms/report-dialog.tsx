"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Loader2 } from "lucide-react";

import { generateReportAction } from "@/app/actions";
import { MultiCheck } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localDateInTimezone } from "@/lib/domain/dates";
import type { Child } from "@/lib/domain/types";

export function ReportDialog({ childOptions, timezone }: { childOptions: Child[]; timezone: string }) {
  const today = localDateInTimezone(new Date(), timezone);
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [childIds, setChildIds] = useState<string[]>([]);
  const [included, setIncluded] = useState({ care: true, appointments: true, incidents: true });
  const [error, setError] = useState<string>();
  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      setError(undefined);
      const result = await generateReportAction({
        from: formData.get("from")?.toString(),
        to: formData.get("to")?.toString(),
        childIds,
        includeCare: included.care,
        includeAppointments: included.appointments,
        includeIncidents: included.incidents,
      });
      if (!result.ok) throw new Error(result.error ?? "Unable to generate report");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      setOpen(false);
    },
    onError: (cause) => setError(cause.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><FilePlus2 className="size-4" /> Create report</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={(data) => mutation.mutate(data)}>
          <DialogHeader><DialogTitle>Create evidence package</DialogTitle><DialogDescription>Generate a chart-based overview PDF and an Excel workbook with All Events and individual child tabs, plus original files, a manifest, and checksums.</DialogDescription></DialogHeader>
          <div className="my-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="from">From</Label><Input id="from" name="from" type="date" required defaultValue={localDateInTimezone(oneMonthAgo, timezone)} /></div>
              <div className="space-y-2"><Label htmlFor="to">Through</Label><Input id="to" name="to" type="date" required defaultValue={today} /></div>
            </div>
            <MultiCheck label="Children (leave empty for all)" values={childOptions} selected={childIds} onChange={setChildIds} />
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Include</legend>
              {[{ key: "care", label: "Caregiving records" }, { key: "appointments", label: "Appointments" }, { key: "incidents", label: "Factual incidents" }].map((item) => (
                <label key={item.key} className="flex items-center gap-3 text-sm"><Checkbox checked={included[item.key as keyof typeof included]} onCheckedChange={(checked) => setIncluded((current) => ({ ...current, [item.key]: checked }))} />{item.label}</label>
              ))}
            </fieldset>
            <div className="rounded-xl bg-muted/60 p-4 text-xs leading-5 text-muted-foreground">Routine items and special days include finalized daily logs only. The overview includes charts, incidents, and special days. Reports use descriptive counts, not parenting scores, and do not guarantee admissibility.</div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter><Button type="submit" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="size-4 animate-spin" />}{mutation.isPending ? "Building package…" : "Generate package"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
