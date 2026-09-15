import {
  apiContext,
  apiError,
  apiJson,
  parseJson,
  requireIfMatch,
} from "@/lib/api/v1";
import {
  createDaybookService,
  daybookCreateCareEntrySchema,
} from "@/lib/application/daybook-service";

const inputSchema = daybookCreateCareEntrySchema.refine(
  (input) => input.source.kind !== "routine",
  { message: "Use the routine-record endpoint for routine tasks.", path: ["source"] },
);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { repository, context } = await apiContext();
    const timeline = await repository.getTimeline(context);
    const params = new URL(request.url).searchParams;
    const requestedLimit = Number(params.get("limit") ?? "50");
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
      : 50;
    const encodedCursor = params.get("cursor");
    let cursor: string | null = null;
    if (encodedCursor) {
      try {
        cursor = Buffer.from(encodedCursor, "base64url").toString("utf8");
      } catch {
        throw new Error("INVALID_CURSOR");
      }
    }
    const filtered = timeline.items.filter(
      (item) =>
        item.kind === "care" &&
        (!cursor || `${item.occurredAt}\0${item.id}` < cursor),
    );
    const items = filtered.slice(0, limit);
    const itemIds = new Set(items.map((item) => item.id));
    return apiJson({
      data: {
        items,
        attachments: timeline.attachments.filter(
          (attachment) =>
            attachment.recordType === "care_entry" &&
            itemIds.has(attachment.recordId),
        ),
        revisions: timeline.revisions.filter(
          (revision) =>
            revision.recordType === "care_entry" &&
            itemIds.has(revision.recordId),
        ),
        nextCursor:
          filtered.length > items.length && items.length
            ? Buffer.from(
                `${items.at(-1)!.occurredAt}\0${items.at(-1)!.id}`,
              ).toString("base64url")
            : null,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, inputSchema);
    requireIfMatch(request);
    const { repository, context } = await apiContext({
      request,
      operationName: "care_record.create",
      input,
      expectedVersionKind: "day",
    });
    const service = createDaybookService(repository, context);
    const entry = await service.createCareEntry(input);
    const view = await service.getCareEntry(entry.id);
    return apiJson({ data: view }, { status: 201 }, view.recordVersion);
  } catch (error) {
    return apiError(error);
  }
}
