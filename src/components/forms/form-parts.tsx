"use client";

import { useId } from "react";
import { Paperclip } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ATTACHMENT_CONTENT_TYPES,
  attachmentTypeForFile,
  maxAttachmentBytes,
  MAX_ATTACHMENTS_PER_RECORD,
} from "@/lib/domain/attachments";
import { cn } from "@/lib/utils";

export function MultiCheck({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: Array<{ id: string; displayName: string; secondary?: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const groupId = useId();
  return (
    <fieldset className="min-w-0 max-w-full space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid min-w-0 max-w-full gap-2 sm:grid-cols-2">
        {values.map((value) => {
          const checked = selected.includes(value.id);
          return (
            <label
              key={value.id}
              className={cn(
                "flex min-h-11 min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition",
                checked ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/50",
              )}
            >
              <Checkbox
                id={`${groupId}-${value.id}`}
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(
                    next
                      ? [...selected, value.id]
                      : selected.filter((item) => item !== value.id),
                  )
                }
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="block text-sm font-medium">{value.displayName}</span>
                {value.secondary && <span className="block text-xs text-muted-foreground">{value.secondary}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="max-w-full text-xs font-medium text-destructive [overflow-wrap:anywhere]">{errors[0]}</p>;
}

export function AttachmentPicker({
  files,
  onChange,
  maxFiles = MAX_ATTACHMENTS_PER_RECORD,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
}) {
  const id = useId();
  return (
    <div className="min-w-0 max-w-full space-y-2">
      <Label htmlFor={id}>Supporting files (optional)</Label>
      <label
        htmlFor={id}
        className="flex min-h-20 w-full min-w-0 max-w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 px-4 text-center text-sm text-muted-foreground hover:bg-muted/60"
      >
        <Paperclip className="size-4 shrink-0" />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {files.length
            ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
            : "Add JPEG, PNG, HEIC, PDF, MP4, MOV, or WebM · videos up to 50 MB"}
        </span>
      </label>
      <input
        id={id}
        className="sr-only"
        type="file"
        multiple
        accept={ATTACHMENT_CONTENT_TYPES.join(",")}
        disabled={maxFiles === 0}
        onChange={(event) =>
          onChange(Array.from(event.target.files ?? []).slice(0, maxFiles))
        }
      />
    </div>
  );
}

function uploadToPresignedUrl(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (percentage: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("The file could not be uploaded to private storage."));
    });
    request.addEventListener("error", () =>
      reject(new Error("The file upload was interrupted.")),
    );
    request.send(file);
  });
}

export async function uploadFiles(
  files: File[],
  recordType: "care_entry" | "appointment" | "incident",
  recordId: string,
  onProgress?: (progress: {
    fileName: string;
    fileIndex: number;
    fileCount: number;
    percentage: number;
  }) => void,
) {
  const {
    finalizeAttachmentUploadAction,
    prepareAttachmentUploadAction,
    uploadAttachmentAction,
  } = await import("@/app/actions");
  for (const [index, file] of files.entries()) {
    const declaredContentType = attachmentTypeForFile(file);
    if (!declaredContentType) {
      throw new Error("Only JPEG, PNG, HEIC, PDF, MP4, MOV, and WebM files are accepted.");
    }
    if (file.size > maxAttachmentBytes(declaredContentType)) {
      throw new Error(
        declaredContentType.startsWith("video/")
          ? "Videos must be 50 MB or smaller."
          : "Images and PDFs must be 15 MB or smaller.",
      );
    }
    const prepared = await prepareAttachmentUploadAction({
      recordType,
      recordId,
      originalName: file.name,
      declaredContentType,
      declaredSize: file.size,
    });
    if (!prepared.ok || !prepared.data) {
      throw new Error(prepared.error ?? "Attachment upload could not be prepared.");
    }
    const reportProgress = (percentage: number) =>
      onProgress?.({
        fileName: file.name,
        fileIndex: index + 1,
        fileCount: files.length,
        percentage,
      });
    reportProgress(0);
    if (prepared.data.mode === "local") {
      const formData = new FormData();
      formData.set("claim", JSON.stringify(prepared.data.claim));
      formData.set("file", file);
      const result = await uploadAttachmentAction(formData);
      if (!result.ok) throw new Error(result.error ?? "Attachment upload failed");
    } else {
      if (!prepared.data.presignedUrl) {
        throw new Error("Private storage did not return an upload URL.");
      }
      await uploadToPresignedUrl(
        prepared.data.presignedUrl,
        file,
        declaredContentType,
        reportProgress,
      );
      const result = await finalizeAttachmentUploadAction(prepared.data.claim);
      if (!result.ok) throw new Error(result.error ?? "Attachment upload failed");
    }
    reportProgress(100);
  }
}
