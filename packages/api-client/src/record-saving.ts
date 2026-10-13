"use client";

import { useMutation, useMutationState, useQueryClient, type QueryKey } from "@tanstack/react-query";

const recordSaveKey = ["record-save"];

type SaveContext = { savedId?: string; confirmed?: boolean };
export type RecordPreview = {
  queryKey: QueryKey;
  apply: (data: unknown, context: SaveContext) => unknown;
};

/** Previews are layered over server data, never written into the query cache. */
export function previewQuery<T>(queryKey: QueryKey, apply: (data: T, context: SaveContext) => T): RecordPreview {
  return { queryKey, apply: (data, context) => data === undefined ? data : apply(data as T, context) };
}

export function savingRecord<T extends { id: string }>(record: T, savedId?: string, saving = true): T {
  return { ...record, id: savedId ?? record.id, saving };
}

export function isRecordSaving(record: object): boolean {
  return "saving" in record && record.saving === true;
}

export function upsertRecord<T extends { id: string }>(records: T[], record: T): T[] {
  return records.some((item) => item.id === record.id)
    ? records.map((item) => item.id === record.id ? record : item)
    : [record, ...records];
}

type PreviewContext = SaveContext & { previews: RecordPreview[] };

export function useRecordMutation<TData, TVariables = void>(options: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  preview: (variables: TVariables) => RecordPreview[];
  savedId?: (data: TData) => string | undefined;
  confirm?: (data: TData, variables: TVariables) => RecordPreview[];
  onMutate?: (variables: TVariables) => void;
  onSuccess?: (data: TData, variables: TVariables) => Promise<unknown> | void;
  onError?: (error: Error, variables: TVariables) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVariables, PreviewContext>({
    mutationKey: recordSaveKey,
    retry: false,
    mutationFn: options.mutationFn,
    onMutate: (variables) => {
      const previews = options.preview(variables);
      options.onMutate?.(variables);
      return { previews };
    },
    onSuccess: async (data, variables, context) => {
      if (context) context.savedId = options.savedId?.(data);
      const confirmed = options.confirm?.(data, variables) ?? [];
      await Promise.all(confirmed.map(({ queryKey }) => queryClient.cancelQueries({ queryKey })));
      for (const preview of confirmed) {
        queryClient.setQueriesData({ queryKey: preview.queryKey }, (current: unknown) => preview.apply(current, { confirmed: true }));
      }
      // Keep the preview until the caller has reconciled with the server.
      await options.onSuccess?.(data, variables);
    },
    onError: (error, variables, context) => {
      options.onError?.(error, variables);
      // Refresh version tokens after conflicts without delaying draft recovery.
      for (const preview of context?.previews ?? []) {
        void queryClient.invalidateQueries({ queryKey: preview.queryKey });
      }
    },
  });
}

export function useRecordPreview<T>(queryKey: QueryKey, data: T): T {
  const pending = useMutationState({
    filters: { mutationKey: recordSaveKey, status: "pending" },
    select: (mutation) => mutation.state.context as PreviewContext | undefined,
  });
  return pending.reduce((current, context) => {
    if (!context) return current;
    return context.previews.reduce((value, preview) =>
      preview.queryKey.every((part, index) => part === queryKey[index])
        ? preview.apply(value, context) as T
        : value, current);
  }, data);
}
