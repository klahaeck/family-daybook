import { DaybookApiClient } from "@family-daybook/api-client";

function response(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("DaybookApiClient idempotency", () => {
  afterEach(() => jest.restoreAllMocks());

  it("retains an operation ID through failure and clears it after validated success", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(503, { error: { code: "SERVICE_UNAVAILABLE", message: "Try again." } }))
      .mockResolvedValueOnce(response(200, { data: { id: "day_1", localDate: "2026-09-15", status: "open", notes: "same", dayVersion: "v2" } }))
      .mockResolvedValueOnce(response(200, { data: { id: "day_1", localDate: "2026-09-15", status: "open", notes: "same", dayVersion: "v3" } }));
    const operationIds = jest.fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    const client = new DaybookApiClient("https://example.test", async () => "token", operationIds);

    await expect(client.updateDayNotes("2026-09-15", "same", "v1")).rejects.toThrow("Try again.");
    await expect(client.updateDayNotes("2026-09-15", "same", "v1")).resolves.toMatchObject({ dayVersion: "v2" });
    await expect(client.updateDayNotes("2026-09-15", "same", "v1")).resolves.toMatchObject({ dayVersion: "v3" });

    const keys = fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
    expect(keys).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(operationIds).toHaveBeenCalledTimes(2);
  });

  it("replays a prepared attachment claim with a fresh URL after a blob upload failure", async () => {
    const claim = {
      attachmentId: "attachment_1",
      recordType: "incident",
      recordId: "incident_1",
      pathname: "private/attachment_1.pdf",
      originalName: "note.pdf",
      declaredContentType: "application/pdf",
      declaredSize: 3,
    };
    const fetchMock = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(200, { data: { mode: "presigned", claim, presignedUrl: "https://blob.example/upload-1" } }))
      .mockResolvedValueOnce(new Response(undefined, { status: 500 }))
      .mockResolvedValueOnce(response(200, { data: { mode: "presigned", claim, presignedUrl: "https://blob.example/upload-2" } }))
      .mockResolvedValueOnce(new Response(undefined, { status: 200 }))
      .mockResolvedValueOnce(response(200, { data: {
        id: claim.attachmentId,
        recordType: claim.recordType,
        recordId: claim.recordId,
        revisionId: "revision_1",
        originalName: claim.originalName,
        contentType: claim.declaredContentType,
        size: claim.declaredSize,
        sha256: "abc123",
        uploadedAt: "2026-09-15T12:00:00.000Z",
      } }));
    const client = new DaybookApiClient(
      "https://example.test",
      async () => "token",
      jest.fn()
        .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
        .mockReturnValueOnce("22222222-2222-4222-8222-222222222222"),
    );
    const input = {
      recordType: claim.recordType,
      recordId: claim.recordId,
      originalName: claim.originalName,
      declaredContentType: claim.declaredContentType,
      declaredSize: claim.declaredSize,
    };

    await expect(client.uploadAttachment(input, new Uint8Array([1, 2, 3]))).rejects.toThrow("file upload failed");
    await expect(client.uploadAttachment(input, new Uint8Array([1, 2, 3]))).resolves.toMatchObject({ id: "attachment_1" });

    const prepareCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/v1/attachments/prepare"));
    expect(prepareCalls).toHaveLength(2);
    expect(prepareCalls.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"))).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
    ]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://blob.example/upload-"))).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/v1/attachments/finalize"))).toHaveLength(1);
  });

  it("retries finalization without overwriting an already uploaded blob", async () => {
    const claim = {
      attachmentId: "attachment_2",
      recordType: "care_entry",
      recordId: "care_1",
      pathname: "private/attachment_2.pdf",
      originalName: "receipt.pdf",
      declaredContentType: "application/pdf",
      declaredSize: 3,
    };
    const attachment = {
      id: claim.attachmentId,
      recordType: claim.recordType,
      recordId: claim.recordId,
      revisionId: "revision_2",
      originalName: claim.originalName,
      contentType: claim.declaredContentType,
      size: claim.declaredSize,
      sha256: "def456",
      uploadedAt: "2026-09-15T12:00:00.000Z",
    };
    const fetchMock = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(200, { data: { mode: "presigned", claim, presignedUrl: "https://blob.example/upload-once" } }))
      .mockResolvedValueOnce(new Response(undefined, { status: 200 }))
      .mockResolvedValueOnce(response(503, { error: { code: "SERVICE_UNAVAILABLE", message: "Try again." } }))
      .mockResolvedValueOnce(response(201, { data: attachment }));
    const client = new DaybookApiClient(
      "https://example.test",
      async () => "token",
      jest.fn()
        .mockReturnValueOnce("33333333-3333-4333-8333-333333333333")
        .mockReturnValueOnce("44444444-4444-4444-8444-444444444444"),
    );
    const input = {
      recordType: claim.recordType,
      recordId: claim.recordId,
      originalName: claim.originalName,
      declaredContentType: claim.declaredContentType,
      declaredSize: claim.declaredSize,
    };

    await expect(client.uploadAttachment(input, new Uint8Array([1, 2, 3]))).rejects.toThrow("Try again.");
    await expect(client.uploadAttachment(input, new Uint8Array([1, 2, 3]))).resolves.toMatchObject({ id: "attachment_2" });

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/v1/attachments/prepare"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "https://blob.example/upload-once")).toHaveLength(1);
    const finalizeCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/v1/attachments/finalize"));
    expect(finalizeCalls).toHaveLength(2);
    expect(finalizeCalls.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"))).toEqual([
      "44444444-4444-4444-8444-444444444444",
      "44444444-4444-4444-8444-444444444444",
    ]);
  });
});
