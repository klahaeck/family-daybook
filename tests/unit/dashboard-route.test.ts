import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repository", () => ({
  getRepository: vi.fn(),
  getRequestContext: vi.fn(),
}));

import { GET } from "@/app/api/dashboard/route";
import type { Identity } from "@/lib/auth/identity";
import { localDateInTimezone } from "@/lib/domain/dates";
import { getRepository, getRequestContext } from "@/lib/repository";
import {
  MemoryParentingRepository,
  resetMemoryRepository,
} from "@/lib/repository/memory-repository";

const ownerIdentity: Identity = {
  authUserId: "demo_owner",
  email: "owner@example.local",
  displayName: "Demo owner",
  mfaEnabled: true,
  demo: true,
};

describe("dashboard route authorization", () => {
  beforeEach(() => {
    resetMemoryRepository();
    vi.resetAllMocks();
  });

  it("returns 404 rather than exposing an open day to a reviewer", async () => {
    const repository = new MemoryParentingRepository();
    const owner = await repository.resolveContext(ownerIdentity);
    const localDate = localDateInTimezone(new Date(), owner.workspace.timezone);
    await repository.getDashboard(owner, localDate);
    const reviewer = await repository.inviteReviewer(owner, {
      email: "route-reviewer@example.test",
      displayName: "Route Reviewer",
    });
    reviewer.status = "active";
    reviewer.authUserId = "route_reviewer";
    const reviewerContext = await repository.resolveContext({
      ...ownerIdentity,
      authUserId: reviewer.authUserId,
      email: reviewer.email,
    });
    vi.mocked(getRepository).mockResolvedValue(repository);
    vi.mocked(getRequestContext).mockResolvedValue(reviewerContext);

    const response = await GET(
      new Request(`https://daybook.example/api/dashboard?date=${localDate}`),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "NOT_FOUND" });
  });
});
