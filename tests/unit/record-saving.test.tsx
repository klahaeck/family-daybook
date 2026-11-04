// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { isRecordSaving, previewQuery, savingRecord, upsertRecord, useRecordMutation, useRecordPreview } from "@family-daybook/api-client/record-saving";
import { useRecordSave } from "@/components/forms/use-record-save";
import { uploadFiles } from "@/components/forms/form-parts";

vi.mock("@/components/forms/form-parts", () => ({ uploadFiles: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

type Row = { id: string; text: string };
const preview = (row: Row) => [previewQuery<Row[]>(["records"], (rows, { savedId, confirmed }) => upsertRecord(rows, savingRecord(row, savedId, !confirmed)))];

describe("record save events", () => {
  it("layers concurrent saves over fresh server data and rolls back only the rejected save", async () => {
    const { client, wrapper } = setup();
    const first = deferred<Row>();
    const second = deferred<Row>();
    const { result } = renderHook(() => {
      const query = useQuery({ queryKey: ["records"], queryFn: async () => client.getQueryData<Row[]>(["records"]) ?? [], initialData: [] as Row[] });
      const a = useRecordMutation({ mutationFn: () => first.promise, preview: () => preview({ id: "pending:a", text: "A" }), savedId: (row) => row.id, confirm: (row) => preview(row) });
      const b = useRecordMutation({ mutationFn: () => second.promise, preview: () => preview({ id: "pending:b", text: "B" }), savedId: (row) => row.id, confirm: (row) => preview(row) });
      return { a, b, rows: useRecordPreview(["records"], query.data) };
    }, { wrapper });

    act(() => { result.current.a.mutate(); result.current.b.mutate(); });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(client.getQueryData(["records"])).toEqual([]);
    expect(result.current.rows.every(isRecordSaving)).toBe(true);
    act(() => client.setQueryData(["records"], [{ id: "remote", text: "Another device" }]));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    await act(async () => first.resolve({ id: "server:a", text: "A saved" }));
    await waitFor(() => expect(result.current.a.isSuccess).toBe(true));
    await act(async () => second.reject(new Error("VERSION_CONFLICT")));
    await waitFor(() => expect(result.current.b.isError).toBe(true));
    expect(result.current.rows.map((row) => row.id)).toEqual(["server:a", "remote"]);
    expect(result.current.rows.some(isRecordSaving)).toBe(false);
    expect(client.getQueryData(["records"])).toEqual(result.current.rows);
  });

  it("keeps the pending state through reconciliation and deduplicates the server identity", async () => {
    const { wrapper } = setup();
    const save = deferred<Row>();
    const refresh = deferred<void>();
    const { result } = renderHook(() => {
      const query = useQuery({ queryKey: ["records"], queryFn: async () => [] as Row[], initialData: [] as Row[] });
      const mutation = useRecordMutation({ mutationFn: () => save.promise, preview: () => preview({ id: "pending", text: "Draft" }), savedId: (row) => row.id, confirm: (row) => preview(row), onSuccess: () => refresh.promise });
      return { mutation, rows: useRecordPreview(["records"], query.data) };
    }, { wrapper });
    act(() => result.current.mutation.mutate());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    await act(async () => save.resolve({ id: "server", text: "Saved" }));
    await waitFor(() => expect(result.current.rows[0].id).toBe("server"));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.mutation.isPending).toBe(true);
    await act(async () => refresh.resolve());
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
    expect(result.current.rows).toEqual([{ id: "server", text: "Saved", saving: false }]);
  });

  it("preserves a committed record and retries only the remaining supporting files", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(["records"], []);
    const first = new File(["first"], "first.pdf", { type: "application/pdf" });
    const second = new File(["second"], "second.pdf", { type: "application/pdf" });
    const save = vi.fn(async () => ({ id: "server", confirmed: preview({ id: "server", text: "Saved" }) }));
    const setFiles = vi.fn();
    const setOpen = vi.fn();
    vi.mocked(uploadFiles).mockReset().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Offline"));
    const { result, rerender } = renderHook(({ files }) => useRecordSave({ save, preview: () => preview({ id: "pending", text: "Draft" }), recordType: "incident", queryKeys: [["records"]], files, setFiles, setOpen }), { wrapper, initialProps: { files: [first, second] } });
    act(() => result.current.mutate(undefined));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.errorMessage).toContain("Record saved");
    expect(client.getQueryData<Row[]>(["records"])?.[0].id).toBe("server");
    expect(setFiles).toHaveBeenLastCalledWith([second]);
    expect(setOpen).toHaveBeenLastCalledWith(true);
    rerender({ files: [second] });
    vi.mocked(uploadFiles).mockResolvedValueOnce(undefined);
    act(() => result.current.mutate(undefined));
    await waitFor(() => expect(result.current.retryingFiles).toBe(false));
    expect(save).toHaveBeenCalledTimes(1);
    expect(uploadFiles).toHaveBeenLastCalledWith([second], "incident", "server");
  });
});
