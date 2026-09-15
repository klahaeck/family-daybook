import {
  accountDeleteInputSchema,
  accountDeleteResultSchema,
  apiErrorSchema,
  appointmentInputSchema,
  appointmentSchema,
  attachmentClaimSchema,
  attachmentPrepareInputSchema,
  attachmentSchema,
  preparedAttachmentSchema,
  billingLinkIntentSchema,
  billingLinkIntentInputSchema,
  careCorrectionInputSchema,
  careEntryViewSchema,
  careRecordUpdateInputSchema,
  correctionInputSchema,
  customCareRecordInputSchema,
  daySchema,
  dayMutationResultSchema,
  incidentInputSchema,
  incidentSchema,
  listAppointmentsSchema,
  listCareRecordsSchema,
  listIncidentsSchema,
  listReportsSchema,
  listSpecialDaysSchema,
  purgeInputSchema,
  recordBundleSchema,
  recordRevisionSchema,
  reportInputSchema,
  reportSchema,
  reviewerInviteInputSchema,
  reviewerSchema,
  routineRecordInputSchema,
  routineRecordResultSchema,
  sessionSchema,
  settingsSchema,
  settingsUpdateInputSchema,
  specialDayCorrectionInputSchema,
  specialDayDetailSchema,
  specialDayInputSchema,
  specialDayUpdateInputSchema,
  specialDayCreateResultSchema,
  timelineSchema,
  type ApiErrorBody,
} from "@family-daybook/contracts";
import type { z } from "zod";

export type TokenProvider = (options?: { skipCache?: boolean }) => Promise<string | null>;
export type OperationIdProvider = () => string;

export class DaybookApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorBody["error"]["code"],
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "DaybookApiError";
  }
}

type JsonRequest = Omit<RequestInit, "body"> & {
  body?: unknown;
  schema?: z.ZodType;
  idempotencyKey?: string;
  version?: string;
};

function queryString(values: Record<string, string | undefined>) {
  const query = Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]));
  return query.length ? `?${new URLSearchParams(query).toString()}` : "";
}

type PendingAttachmentUpload = {
  prepareOperationId: string;
  prepared?: z.infer<typeof preparedAttachmentSchema>;
  blobUploaded: boolean;
};

export class DaybookApiClient {
  private readonly pendingOperationIds = new Map<string, string>();
  private readonly pendingAttachmentUploads = new Map<string, PendingAttachmentUpload>();

  constructor(
    private readonly baseUrl: string,
    private readonly getToken: TokenProvider,
    private readonly createOperationId: OperationIdProvider,
  ) {}

  private operationFingerprint(path: string, method: string, body: unknown, version?: string) {
    return JSON.stringify([method, path, version ?? null, body ?? null]);
  }

  private async fetch(path: string, init: RequestInit, retry = true): Promise<Response> {
    const token = await this.getToken({ skipCache: !retry });
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await globalThis.fetch(new URL(path, this.baseUrl), { ...init, headers });
    if (response.status === 401 && retry) return this.fetch(path, init, false);
    return response;
  }

  private async json<S extends z.ZodType>(path: string, options: JsonRequest & { schema: S }): Promise<z.infer<S>>;
  private async json<T = unknown>(path: string, options?: JsonRequest): Promise<T>;
  private async json<T>(path: string, options: JsonRequest = {}): Promise<T> {
    const { body, schema, idempotencyKey: suppliedIdempotencyKey, version, ...init } = options;
    const method = init.method?.toUpperCase() ?? "GET";
    const tracksOperation = method !== "GET" && method !== "HEAD";
    const operationFingerprint = tracksOperation && !suppliedIdempotencyKey
      ? this.operationFingerprint(path, method, body, version)
      : undefined;
    const idempotencyKey = suppliedIdempotencyKey ?? (operationFingerprint
      ? this.pendingOperationIds.get(operationFingerprint) ?? this.createOperationId()
      : undefined);
    if (operationFingerprint && idempotencyKey) {
      this.pendingOperationIds.set(operationFingerprint, idempotencyKey);
    }
    const headers = new Headers(init.headers);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
    if (version) headers.set("If-Match", version);
    const response = await this.fetch(path, {
      ...init,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(payload);
      if (parsed.success) {
        const detail = parsed.data.error;
        throw new DaybookApiError(response.status, detail.code, detail.message, detail.fieldErrors, detail.retryAfterSeconds);
      }
      throw new DaybookApiError(response.status, "INTERNAL_ERROR", `Request failed (${response.status}).`);
    }
    const data = payload && typeof payload === "object" && "data" in payload
      ? (payload as { data: unknown }).data
      : payload;
    const parsed = (schema ? schema.parse(data) : data) as T;
    if (operationFingerprint && this.pendingOperationIds.get(operationFingerprint) === idempotencyKey) {
      this.pendingOperationIds.delete(operationFingerprint);
    }
    return parsed;
  }

  getSession = () => this.json("/api/v1/session", { schema: sessionSchema });
  getDay = (date: string) => this.json(`/api/v1/days/${encodeURIComponent(date)}`, { schema: daySchema });
  recordRoutine = (date: string, input: unknown, version: string, idempotencyKey?: string) =>
    this.json(`/api/v1/days/${encodeURIComponent(date)}/routine-records`, {
      method: "POST", body: routineRecordInputSchema.parse(input), version, idempotencyKey, schema: routineRecordResultSchema,
    });
  updateDayNotes = (date: string, notes: string, version: string, idempotencyKey?: string) =>
    this.json(`/api/v1/days/${encodeURIComponent(date)}/notes`, { method: "PUT", body: { notes }, version, idempotencyKey, schema: dayMutationResultSchema });
  finalizeDay = (date: string, version: string, idempotencyKey?: string) =>
    this.json(`/api/v1/days/${encodeURIComponent(date)}/finalize`, { method: "POST", body: {}, version, idempotencyKey, schema: dayMutationResultSchema });

  listCareRecords = (cursor?: string) => this.json(`/api/v1/care-records${queryString({ cursor })}`, { schema: listCareRecordsSchema });
  createCareRecord = (input: unknown, version: string, idempotencyKey?: string) => this.json("/api/v1/care-records", { method: "POST", body: customCareRecordInputSchema.parse(input), version, idempotencyKey, schema: careEntryViewSchema });
  getCareRecord = (id: string) => this.json(`/api/v1/care-records/${encodeURIComponent(id)}`, { schema: careEntryViewSchema });
  updateCareRecord = (id: string, input: unknown, version: string, idempotencyKey?: string) => this.json(`/api/v1/care-records/${encodeURIComponent(id)}`, { method: "PATCH", body: careRecordUpdateInputSchema.parse(input), version, idempotencyKey, schema: careEntryViewSchema });
  correctCareRecord = (id: string, input: unknown, version: string, idempotencyKey?: string) => this.json(`/api/v1/care-records/${encodeURIComponent(id)}/corrections`, { method: "POST", body: careCorrectionInputSchema.parse(input), version, idempotencyKey });

  listAppointments = () => this.json("/api/v1/appointments", { schema: listAppointmentsSchema });
  createAppointment = (input: unknown, idempotencyKey?: string) => this.json("/api/v1/appointments", { method: "POST", body: appointmentInputSchema.parse(input), idempotencyKey, schema: appointmentSchema });
  listIncidents = () => this.json("/api/v1/incidents", { schema: listIncidentsSchema });
  createIncident = (input: unknown, idempotencyKey?: string) => this.json("/api/v1/incidents", { method: "POST", body: incidentInputSchema.parse(input), idempotencyKey, schema: incidentSchema });
  correctRecord = (input: unknown, version: string, idempotencyKey?: string) => this.json("/api/v1/records/corrections", { method: "POST", body: correctionInputSchema.parse(input), version, idempotencyKey });
  getRecordBundle = (recordType: "care_entry" | "appointment" | "incident", id: string) => this.json(`/api/v1/records/${encodeURIComponent(recordType)}/${encodeURIComponent(id)}`, { schema: recordBundleSchema });
  purgeRecord = (input: unknown, idempotencyKey?: string) => this.json<void>("/api/v1/records/purge", { method: "POST", body: purgeInputSchema.parse(input), idempotencyKey });

  getTimeline = (filters: { cursor?: string; from?: string; to?: string; childId?: string; kind?: string } = {}) => this.json(`/api/v1/timeline${queryString(filters)}`, { schema: timelineSchema });
  listSpecialDays = () => this.json("/api/v1/special-days", { schema: listSpecialDaysSchema });
  getSpecialDay = (id: string) => this.json(`/api/v1/special-days/${encodeURIComponent(id)}`, { schema: specialDayDetailSchema });
  createSpecialDay = (input: unknown, idempotencyKey?: string) => this.json("/api/v1/special-days", { method: "POST", body: specialDayInputSchema.parse(input), idempotencyKey, schema: specialDayCreateResultSchema });
  updateSpecialDay = (id: string, input: unknown, version: string, idempotencyKey?: string) => this.json(`/api/v1/special-days/${encodeURIComponent(id)}`, { method: "PATCH", body: specialDayUpdateInputSchema.parse(input), version, idempotencyKey, schema: specialDayDetailSchema });
  correctSpecialDay = (id: string, input: unknown, version: string, idempotencyKey?: string) => this.json(`/api/v1/special-days/${encodeURIComponent(id)}/corrections`, { method: "POST", body: specialDayCorrectionInputSchema.parse(input), version, idempotencyKey, schema: recordRevisionSchema });

  listReports = () => this.json("/api/v1/reports", { schema: listReportsSchema });
  createReport = (input: unknown, idempotencyKey?: string) => this.json("/api/v1/reports", { method: "POST", body: reportInputSchema.parse(input), idempotencyKey, schema: reportSchema });
  getReport = (id: string) => this.json(`/api/v1/reports/${encodeURIComponent(id)}`, { schema: reportSchema });
  async downloadReport(id: string, format: "pdf" | "zip"): Promise<Uint8Array> {
    const response = await this.fetch(`/api/v1/reports/${encodeURIComponent(id)}/download?format=${format}`, { headers: { Accept: format === "pdf" ? "application/pdf" : "application/zip" } });
    if (!response.ok) throw new DaybookApiError(response.status, "INTERNAL_ERROR", "Unable to download the report.");
    return new Uint8Array(await response.arrayBuffer());
  }

  getSettings = () => this.json("/api/v1/settings", { schema: settingsSchema });
  updateSettings = (input: unknown, idempotencyKey?: string) => this.json("/api/v1/settings", { method: "PUT", body: settingsUpdateInputSchema.parse(input), idempotencyKey, schema: settingsSchema });
  inviteReviewer = (input: unknown, idempotencyKey?: string) => this.json("/api/v1/reviewers", { method: "POST", body: reviewerInviteInputSchema.parse(input), idempotencyKey, schema: reviewerSchema });
  revokeReviewer = (id: string, idempotencyKey?: string) => this.json<void>(`/api/v1/reviewers/${encodeURIComponent(id)}`, { method: "DELETE", idempotencyKey });
  createBillingLinkIntent = (input: unknown, idempotencyKey?: string) => this.json("/api/v1/billing/link-intents", { method: "POST", body: billingLinkIntentInputSchema.parse(input), idempotencyKey, schema: billingLinkIntentSchema });
  prepareAttachment = (input: unknown, idempotencyKey?: string) => this.json("/api/v1/attachments/prepare", { method: "POST", body: attachmentPrepareInputSchema.parse(input), idempotencyKey, schema: preparedAttachmentSchema });
  finalizeAttachment = (claim: unknown, idempotencyKey?: string) => this.json("/api/v1/attachments/finalize", { method: "POST", body: attachmentClaimSchema.parse(claim), idempotencyKey, schema: attachmentSchema });
  async uploadAttachment(input: unknown, bytes: Uint8Array) {
    const parsedInput = attachmentPrepareInputSchema.parse(input);
    const fingerprint = JSON.stringify(parsedInput);
    const pending = this.pendingAttachmentUploads.get(fingerprint) ?? {
      prepareOperationId: this.createOperationId(),
      blobUploaded: false,
    };
    this.pendingAttachmentUploads.set(fingerprint, pending);

    // If the blob write succeeded but finalization did not reach the client,
    // retry finalization directly. The finalization endpoint is idempotent and
    // an overwrite-disabled blob cannot safely be PUT a second time.
    if (pending.blobUploaded && pending.prepared) {
      const attachment = await this.finalizeAttachment(pending.prepared.claim);
      this.pendingAttachmentUploads.delete(fingerprint);
      return attachment;
    }

    // Ask the API to replay the stable claim on every attempt so it can issue a
    // fresh presigned URL if the previous upload URL expired while offline.
    const prepared = await this.prepareAttachment(parsedInput, pending.prepareOperationId);
    if (prepared.mode !== "presigned") throw new Error("Direct mobile uploads require private blob storage.");
    pending.prepared = prepared;
    const response = await globalThis.fetch(prepared.presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": prepared.claim.declaredContentType },
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) throw new Error("The file upload failed. Please try again.");
    pending.blobUploaded = true;
    const attachment = await this.finalizeAttachment(prepared.claim);
    this.pendingAttachmentUploads.delete(fingerprint);
    return attachment;
  }
  async downloadAttachment(id: string): Promise<Uint8Array> {
    const response = await this.fetch(`/api/v1/attachments/${encodeURIComponent(id)}`, { headers: { Accept: "application/octet-stream" } });
    if (!response.ok) throw new DaybookApiError(response.status, "INTERNAL_ERROR", "Unable to download the attachment.");
    return new Uint8Array(await response.arrayBuffer());
  }
  deleteAccount = (input: unknown, idempotencyKey?: string) => this.json("/api/v1/account", { method: "DELETE", body: accountDeleteInputSchema.parse(input), idempotencyKey, schema: accountDeleteResultSchema });
}
