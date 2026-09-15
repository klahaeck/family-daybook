import { describe, expect, it } from "vitest";

import { canonicalJson, createRevisionHash, sha256 } from "@/lib/domain/integrity";
import { dayVersionFor } from "@/lib/repository/helpers";
import type {
  CareEntry,
  DailyLog,
  RecordRevision,
  SpecialArrangementDay,
} from "@/lib/domain/types";

describe("record integrity", () => {
  it("canonicalizes object keys recursively", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"y":2},"z":1}',
    );
  });

  it("produces the same hash for equivalent payload ordering", () => {
    const shared = { authorId: "member_1", recordedAt: "2026-07-14T12:00:00.000Z" };
    expect(createRevisionHash({ ...shared, payload: { b: 2, a: 1 } })).toBe(
      createRevisionHash({ ...shared, payload: { a: 1, b: 2 } }),
    );
  });

  it("changes the chain when the previous hash changes", () => {
    const shared = {
      payload: { notes: "Observed fact" },
      authorId: "member_1",
      recordedAt: "2026-07-14T12:00:00.000Z",
    };
    expect(createRevisionHash({ ...shared, previousHash: sha256("one") })).not.toBe(
      createRevisionHash({ ...shared, previousHash: sha256("two") }),
    );
  });

  it("derives a stable day version from log contents and current revision hashes", () => {
    const log: DailyLog = {
      id: "daily_1",
      workspaceId: "workspace_1",
      localDate: "2026-09-14",
      templateVersion: 1,
      status: "open",
      notes: "School day.",
    };
    const entry = {
      id: "care_1",
      workspaceId: "workspace_1",
      dailyLogId: log.id,
      taskKey: "custom",
      taskLabel: "Packed lunch",
      childIds: ["child_1"],
      caregiverIds: ["caregiver_1"],
      status: "completed",
      occurredAt: "2026-09-14T17:00:00.000Z",
      recordedAt: "2026-09-14T17:01:00.000Z",
      currentRevisionId: "revision_1",
      createdBy: "member_1",
      lateEntry: false,
    } satisfies CareEntry;
    const revision = {
      id: entry.currentRevisionId,
      workspaceId: "workspace_1",
      recordType: "care_entry",
      recordId: entry.id,
      revisionNumber: 1,
      payload: { notes: "Packed fruit." },
      reason: "Initial record",
      authorId: "member_1",
      recordedAt: entry.recordedAt,
      hash: sha256("revision-one"),
    } satisfies RecordRevision;
    const initial = dayVersionFor(log, [entry], [revision]);

    expect(initial).toHaveLength(64);
    expect(dayVersionFor(log, [entry], [revision])).toBe(initial);
    expect(dayVersionFor({ ...log, notes: "Changed." }, [entry], [revision])).not.toBe(
      initial,
    );
    expect(
      dayVersionFor(log, [entry], [
        { ...revision, hash: sha256("revision-two") },
      ]),
    ).not.toBe(initial);

    const arrangement = {
      id: "arrangement_1",
      workspaceId: log.workspaceId,
      seriesId: "arrangement_series_1",
      dailyLogId: log.id,
      localDate: log.localDate,
      title: "School holiday",
      status: "active",
      assignments: [],
      tasks: [],
      currentRevisionId: "arrangement_revision_1",
      createdAt: "2026-09-14T16:00:00.000Z",
      updatedAt: "2026-09-14T16:00:00.000Z",
      createdBy: "member_1",
    } satisfies SpecialArrangementDay;
    const arrangementRevision = {
      ...revision,
      id: arrangement.currentRevisionId,
      recordType: "special_arrangement" as const,
      recordId: arrangement.id,
      hash: sha256("arrangement-revision-one"),
    } satisfies RecordRevision;
    const withArrangement = dayVersionFor(
      log,
      [entry],
      [revision, arrangementRevision],
      arrangement,
    );
    expect(withArrangement).not.toBe(initial);
    expect(
      dayVersionFor(
        log,
        [entry],
        [
          revision,
          { ...arrangementRevision, hash: sha256("arrangement-revision-two") },
        ],
        arrangement,
      ),
    ).not.toBe(withArrangement);
    expect(
      dayVersionFor(log, [entry], [revision, arrangementRevision], {
        ...arrangement,
        status: "cancelled",
      }),
    ).toBe(initial);
  });
});
