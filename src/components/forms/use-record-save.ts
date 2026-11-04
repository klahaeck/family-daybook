"use client";

import { useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useRecordMutation, type RecordPreview } from "@family-daybook/api-client/record-saving";
import type { RecordType } from "@/lib/domain/types";
import { uploadFiles } from "./form-parts";

export function useRecordSave<T>({ save, preview, recordType, queryKeys, files, setFiles, setOpen }: {
  save: (input: T) => Promise<{ id: string; confirmed?: RecordPreview[] }>;
  preview: (input: T) => RecordPreview[];
  recordType: RecordType;
  queryKeys: QueryKey[];
  files: File[];
  setFiles: (files: File[]) => void;
  setOpen: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [savedId, setSavedId] = useState<string>();
  const [error, setError] = useState<string>();
  const [preserveDraft, setPreserveDraft] = useState(false);
  const mutation = useRecordMutation({
    preview: (input: T) => savedId ? [] : preview(input),
    savedId: (result) => result.id,
    confirm: (result) => result.confirmed ?? [],
    onMutate: () => { setError(undefined); setPreserveDraft(true); setOpen(false); },
    mutationFn: async (input: T) => {
      const result: { id: string; confirmed?: RecordPreview[] } = savedId ? { id: savedId } : await save(input);
      // A failed upload must never roll back a record that has already committed.
      for (let index = 0; index < files.length; index += 1) {
        try {
          await uploadFiles([files[index]], recordType, result.id);
        } catch (cause) {
          return { ...result, remainingFiles: files.slice(index), uploadError: cause instanceof Error ? cause.message : "Upload failed." };
        }
      }
      return { ...result, remainingFiles: [] as File[], uploadError: undefined };
    },
    onSuccess: async (result) => {
      setFiles(result.remainingFiles);
      setSavedId(result.uploadError ? result.id : undefined);
      await Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (result.uploadError) {
        setError(`Record saved, but a supporting file could not be uploaded. ${result.uploadError}`);
        setOpen(true);
      } else {
        setPreserveDraft(false);
      }
    },
    onError: (cause) => { setError(cause.message); setOpen(true); },
  });
  return { ...mutation, preserveDraft, errorMessage: error, retryingFiles: Boolean(savedId) };
}
