"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock3, Paperclip, Upload } from "lucide-react";

import { AttachmentPicker, FieldError, uploadFiles } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function IncidentAttachmentsDialog({
  recordId,
  remainingSlots,
}: {
  recordId: string;
  remainingSlots: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<string>();
  const mutation = useMutation({
    mutationFn: async () => {
      setError(undefined);
      await uploadFiles(files, "incident", recordId, (status) => {
        setProgress(
          `Uploading ${status.fileIndex} of ${status.fileCount}: ${status.fileName} · ${status.percentage}%`,
        );
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["incidents"] }),
        queryClient.invalidateQueries({ queryKey: ["timeline"] }),
      ]);
      setOpen(false);
      setFiles([]);
      setProgress(undefined);
    },
    onError: (cause) => {
      setProgress(undefined);
      setError(cause.message);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) setOpen(next);
        if (!next) {
          setFiles([]);
          setError(undefined);
          setProgress(undefined);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Paperclip className="size-3.5" /> Add supporting files
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add supporting files</DialogTitle>
          <DialogDescription>
            Add up to {remainingSlots} more {remainingSlots === 1 ? "file" : "files"} to this
            saved incident. Files are preserved as private, downloadable originals.
          </DialogDescription>
        </DialogHeader>
        <div className="my-5 space-y-3">
          <AttachmentPicker files={files} onChange={setFiles} maxFiles={remainingSlots} />
          {progress && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {progress}
            </p>
          )}
          {error && <FieldError errors={[error]} />}
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || files.length === 0}
          >
            {mutation.isPending ? (
              <Clock3 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {mutation.isPending ? "Uploading…" : "Upload files"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
