import { apiContext, apiError, apiJson } from "@/lib/api/v1";
import {
  compareTimelineItemsDescending,
  timelineCursorFor,
} from "@/lib/repository/helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { repository, context } = await apiContext();
    const source = await repository.getTimeline(context);
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind");
    const childId = params.get("childId");
    const from = params.get("from");
    const to = params.get("to");
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

    const filtered = source.items
      .filter((item) => {
        const localDate = item.localDate ?? item.occurredAt.slice(0, 10);
        const itemCursor = timelineCursorFor(item);
        return (
          (!kind || item.kind === kind) &&
          (!childId || item.childIds.includes(childId)) &&
          (!from || localDate >= from) &&
          (!to || localDate <= to) &&
          (!cursor || itemCursor < cursor)
        );
      })
      .sort(compareTimelineItemsDescending);
    const page = filtered.slice(0, limit);
    const itemIds = new Set(page.map((item) => item.id));
    return apiJson({
      data: {
        workspace: source.workspace,
        children: source.children,
        caregivers: source.caregivers,
        items: page,
        attachments: source.attachments.filter((item) => itemIds.has(item.recordId)),
        revisions: source.revisions.filter((item) => itemIds.has(item.recordId)),
        nextCursor:
          filtered.length > page.length && page.length
            ? Buffer.from(
              timelineCursorFor(page.at(-1)!),
              ).toString("base64url")
            : null,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
