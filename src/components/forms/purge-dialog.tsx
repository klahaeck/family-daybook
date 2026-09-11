"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { hardPurgeAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RecordType } from "@/lib/domain/types";

export function PurgeDialog({
  recordType,
  recordId,
  triggerLabel = "Purge",
}: {
  recordType: RecordType;
  recordId: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await hardPurgeAction({
        recordType,
        recordId,
        reason: formData.get("reason")?.toString(),
        confirmation: formData.get("confirmation")?.toString(),
      });
      if (!result.ok) throw new Error(result.error ?? "Unable to permanently delete record");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      setOpen(false);
    },
    onError: (cause) => setError(cause.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" />}><Trash2 className="size-3.5" /> {triggerLabel}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={(formData) => mutation.mutate(formData)}>
          <DialogHeader><DialogTitle>Permanently delete this record?</DialogTitle><DialogDescription>This removes the record, every revision and attachment, and all stored report artifacts that contain it. Downloaded copies and unexpired provider backups cannot be revoked.</DialogDescription></DialogHeader>
          <div className="my-5 space-y-4">
            <div className="space-y-2"><Label htmlFor={`purge-reason-${recordId}`}>Reason for deletion</Label><Textarea id={`purge-reason-${recordId}`} name="reason" required minLength={10} maxLength={500} /></div>
            <div className="space-y-2"><Label htmlFor={`purge-confirm-${recordId}`}>Type PERMANENTLY DELETE</Label><Input id={`purge-confirm-${recordId}`} name="confirmation" required autoComplete="off" /></div>
            <p className="text-xs text-muted-foreground">A content-free tombstone containing the prior hashes, actor, reason, and deletion time will remain.</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter><Button type="submit" variant="destructive" disabled={mutation.isPending}><Trash2 className="size-4" />{mutation.isPending ? "Deleting…" : "Permanently delete"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
