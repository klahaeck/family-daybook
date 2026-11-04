"use client";

import { useState } from "react";
import { Check, Clock3, ShieldPlus } from "lucide-react";

import { createIncidentAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toDateTimeLocal } from "@/lib/domain/dates";
import type { Child } from "@/lib/domain/types";
import { incidentSchema, type IncidentInput } from "@/lib/domain/schemas";
import { incidentPreview, pendingIdentity } from "@/lib/record-previews";
import { useRecordSave } from "./use-record-save";
import { AttachmentPicker, FieldError, MultiCheck } from "./form-parts";

export function IncidentDialog({ childOptions }: { childOptions: Child[] }) {
  const [open, setOpen] = useState(false);
  const [childIds, setChildIds] = useState<string[]>(childOptions.map((child) => child.id));
  const [category, setCategory] = useState("safety_hazard");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const mutation = useRecordSave({
    recordType: "incident", queryKeys: [["incidents"], ["timeline"]], files, setFiles, setOpen,
    preview: (input: IncidentInput) => incidentPreview({ ...pendingIdentity(), ...input }),
    save: async (input: IncidentInput) => {
      const result = await createIncidentAction(input);
      if (!result.ok || !result.data) throw new Error(result.error ?? "Unable to save incident");
      return { id: result.data.id, confirmed: result.data.record ? incidentPreview(result.data.record) : [] };
    },
  });
  const submit = (formData: FormData) => {
    setError(undefined);
    try {
      const split = (key: string) => formData.get(key)?.toString().split(",").map((item) => item.trim()).filter(Boolean) ?? [];
      mutation.mutate(incidentSchema.parse({
        category,
        occurredAt: new Date(formData.get("occurredAt")!.toString()).toISOString(),
        discoveredAt: formData.get("discoveredAt")?.toString()
          ? new Date(formData.get("discoveredAt")!.toString()).toISOString()
          : undefined,
        location: formData.get("location")?.toString() || undefined,
        childIds,
        peoplePresent: split("peoplePresent"),
        witnesses: split("witnesses"),
        observations: formData.get("observations")?.toString(),
        exactQuotes: formData.get("exactQuotes")?.toString() || undefined,
        immediateActions: formData.get("immediateActions")?.toString() || undefined,
        outcome: formData.get("outcome")?.toString() || undefined,
      }));
    } catch { setError("Check the incident details and try again."); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) setOpen(next); }}>
      <DialogTrigger render={<Button disabled={mutation.isPending} />}><ShieldPlus className="size-4" /> Add incident</DialogTrigger>
      <DialogContent keepMounted={mutation.preserveDraft} className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={(event) => { event.preventDefault(); if (!mutation.isPending) submit(new FormData(event.currentTarget)); }}>
          <DialogHeader>
            <DialogTitle>Document a factual incident</DialogTitle>
            <DialogDescription>Describe observable actions, exact words, context, and response. Avoid diagnoses, motives, or conclusions.</DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Category</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ["safety_hazard", "Safety hazard"],
                  ["concerning_interaction", "Concerning interaction"],
                  ["other", "Other factual incident"],
                ].map(([value, label]) => (
                  <Button key={value} type="button" size="sm" variant={category === value ? "default" : "outline"} onClick={() => setCategory(value)}>{category === value && <Check className="size-3" />}{label}</Button>
                ))}
              </div>
            </fieldset>
            <MultiCheck label="Children involved or present" values={childOptions} selected={childIds} onChange={setChildIds} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="occurredAt">Occurrence time</Label><Input id="occurredAt" name="occurredAt" type="datetime-local" defaultValue={toDateTimeLocal()} required /></div>
              <div className="space-y-2"><Label htmlFor="discoveredAt">Discovery time (optional)</Label><Input id="discoveredAt" name="discoveredAt" type="datetime-local" /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="location">Location (optional)</Label><Input id="location" name="location" maxLength={200} /></div>
              <div className="space-y-2"><Label htmlFor="peoplePresent">People present</Label><Input id="peoplePresent" name="peoplePresent" placeholder="Separate names with commas" /></div>
              <div className="space-y-2"><Label htmlFor="witnesses">Other witnesses</Label><Input id="witnesses" name="witnesses" placeholder="Separate names with commas" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="observations">What was directly observed?</Label><Textarea id="observations" name="observations" required minLength={10} maxLength={5000} rows={6} placeholder="Use concrete actions and sequence: who did what, where, and when." /></div>
            <div className="space-y-2"><Label htmlFor="exactQuotes">Exact words, if remembered (optional)</Label><Textarea id="exactQuotes" name="exactQuotes" maxLength={3000} rows={3} placeholder="Use quotation marks only for words you remember directly." /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="immediateActions">Immediate actions</Label><Textarea id="immediateActions" name="immediateActions" maxLength={3000} rows={3} /></div>
              <div className="space-y-2"><Label htmlFor="outcome">Outcome</Label><Textarea id="outcome" name="outcome" maxLength={3000} rows={3} /></div>
            </div>
            <AttachmentPicker files={files} onChange={setFiles} />
            {(error || mutation.errorMessage) && <FieldError errors={[error ?? mutation.errorMessage!]} />}
          </div>
          <DialogFooter><Button type="submit" disabled={mutation.isPending || childIds.length === 0}>{mutation.isPending ? <Clock3 className="size-4 animate-spin" /> : <Check className="size-4" />}{mutation.isPending ? "Saving…" : mutation.retryingFiles ? "Retry supporting files" : "Save factual record"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
