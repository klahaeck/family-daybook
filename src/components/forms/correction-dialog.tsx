"use client";

import { useState } from "react";
import { useRecordMutation } from "@family-daybook/api-client/record-saving";
import { textPreview } from "@/lib/record-previews";
import { useQueryClient } from "@tanstack/react-query";
import { History, Pencil } from "lucide-react";

import { correctRecordAction, updateCareEntryNotesAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RecordType } from "@/lib/domain/types";

export function CorrectionDialog({
  recordType,
  recordId,
  currentText,
  mode = "correct",
  disabled = false,
}: {
  recordType: RecordType;
  recordId: string;
  currentText: string;
  mode?: "edit" | "correct";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [preserveDraft, setPreserveDraft] = useState(false);
  const [error, setError] = useState<string>();
  const queryClient = useQueryClient();
  const editing = mode === "edit";
  const mutation = useRecordMutation({
    preview: (formData: FormData) => textPreview(recordType, recordId, formData.get("correctedText")?.toString() ?? ""),
    onMutate: () => { setPreserveDraft(true); setOpen(false); },
    mutationFn: async (formData: FormData) => {
      setError(undefined);
      const correctedText = formData.get("correctedText")?.toString();
      const result = editing
        ? await updateCareEntryNotesAction({ recordId, notes: correctedText })
        : await correctRecordAction({
            recordType,
            recordId,
            correctedText,
            reason: formData.get("reason")?.toString(),
          });
      if (!result.ok) throw new Error(result.error ?? `Unable to save ${editing ? "changes" : "correction"}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      setPreserveDraft(false);
      setOpen(false);
    },
    onError: (cause) => { setError(cause.message); setOpen(true); },
  });
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) setOpen(next); }}>
      <DialogTrigger render={<Button variant="ghost" size="sm" disabled={disabled || mutation.isPending} />}>
        {editing ? <Pencil className="size-3.5" /> : <History className="size-3.5" />}
        {editing ? "Edit" : "Correct"}
      </DialogTrigger>
      <DialogContent keepMounted={preserveDraft} className="sm:max-w-lg">
        <form onSubmit={(event) => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(new FormData(event.currentTarget)); }}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit record" : "Add a correction"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update this record directly while the day is still open."
                : "The prior version remains intact. This correction receives its own timestamp, reason, and integrity hash."}
            </DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-4">
            <div className="space-y-2"><Label htmlFor={`corrected-${recordId}`}>{editing ? "Factual notes" : "Corrected factual text"}</Label><Textarea id={`corrected-${recordId}`} name="correctedText" defaultValue={currentText} rows={6} required maxLength={editing ? 2000 : 5000} /></div>
            {!editing && <div className="space-y-2"><Label htmlFor={`reason-${recordId}`}>Reason for correction</Label><Textarea id={`reason-${recordId}`} name="reason" rows={2} required minLength={5} maxLength={500} placeholder="For example: corrected the recorded time after checking the appointment notice." /></div>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : editing ? "Save changes" : "Append correction"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
