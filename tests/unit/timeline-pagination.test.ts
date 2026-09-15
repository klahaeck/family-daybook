import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/v1")>();
  return { ...actual, apiContext: vi.fn() };
});

import { GET as getTimeline } from "@/app/api/v1/timeline/route";
import { apiContext } from "@/lib/api/v1";
import type { TimelineData, TimelineItem } from "@/lib/domain/types";
import type {
  ParentingRepository,
  RequestContext,
} from "@/lib/repository/repository";

function timelineItem(id: string, occurredAt: string): TimelineItem {
  return {
    id,
    kind: "incident",
    occurredAt,
    recordedAt: occurredAt,
    title: id,
    childIds: ["child_1"],
    caregiverIds: [],
    status: "other",
    currentRevisionId: `revision_${id}`,
  };
}

describe("timeline pagination", () => {
  beforeEach(() => vi.resetAllMocks());

  it("orders and advances cursors by occurredAt DESC then id DESC", async () => {
    const source: TimelineData = {
      workspace: {
        id: "workspace_1",
        name: "Family",
        timezone: "America/Chicago",
        ownerId: "member_1",
        hardDeleteEnabled: false,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        demo: false,
      },
      children: [],
      caregivers: [],
      items: [
        timelineItem("alpha", "2026-09-14T12:00:00.000Z"),
        timelineItem("older", "2026-09-13T12:00:00.000Z"),
        timelineItem("newest", "2026-09-15T12:00:00.000Z"),
        timelineItem("zulu", "2026-09-14T12:00:00.000Z"),
      ],
      attachments: [],
      revisions: [],
    };
    const repository = {
      getTimeline: vi.fn().mockResolvedValue(source),
    } as unknown as ParentingRepository;
    vi.mocked(apiContext).mockResolvedValue({
      repository,
      context: {} as RequestContext,
    });

    const firstResponse = await getTimeline(
      new Request("https://daybook.example/api/v1/timeline?limit=2"),
    );
    const first = await firstResponse.json();
    expect(first.data.items.map((item: TimelineItem) => item.id)).toEqual([
      "newest",
      "zulu",
    ]);
    expect(first.data.nextCursor).toEqual(expect.any(String));

    const secondResponse = await getTimeline(
      new Request(
        `https://daybook.example/api/v1/timeline?limit=2&cursor=${encodeURIComponent(first.data.nextCursor)}`,
      ),
    );
    const second = await secondResponse.json();
    expect(second.data.items.map((item: TimelineItem) => item.id)).toEqual([
      "alpha",
      "older",
    ]);
    expect(second.data.nextCursor).toBeNull();
  });
});
