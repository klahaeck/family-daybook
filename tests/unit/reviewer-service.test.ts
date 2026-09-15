import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  getUserList: vi.fn(),
  getInvitationList: vi.fn(),
  createInvitation: vi.fn(),
}));

vi.mock("@/lib/auth/identity", () => ({ clerkConfigured: () => true }));
vi.mock("@/lib/metadata/site-url", () => ({
  getSiteUrl: () => "https://daybook.example",
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: { getUserList: clerk.getUserList },
    invitations: {
      getInvitationList: clerk.getInvitationList,
      createInvitation: clerk.createInvitation,
    },
  }),
}));

import { inviteWorkspaceReviewer } from "@/lib/application/reviewer-service";
import type { ParentingRepository, RequestContext } from "@/lib/repository/repository";

const member = {
  id: "member_reviewer",
  workspaceId: "workspace_123",
  email: "reviewer@example.com",
  displayName: "Reviewer",
  role: "reviewer" as const,
  status: "invited" as const,
  invitedAt: "2026-09-15T12:00:00.000Z",
};
const context = {
  workspace: { id: "workspace_123" },
} as RequestContext;

describe("inviteWorkspaceReviewer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clerk.getUserList.mockResolvedValue({ data: [] });
  });

  it("reconciles a Clerk invitation that committed before a failed response", async () => {
    clerk.getInvitationList
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{ emailAddress: "reviewer@example.com" }],
      });
    clerk.createInvitation.mockRejectedValueOnce(new Error("network lost"));
    const repository = {
      inviteReviewer: vi.fn().mockResolvedValue(member),
    } as unknown as ParentingRepository;

    await expect(
      inviteWorkspaceReviewer(repository, context, {
        email: "Reviewer@Example.com",
        displayName: "Reviewer",
      }),
    ).resolves.toEqual(member);

    expect(clerk.createInvitation).toHaveBeenCalledTimes(1);
    expect(clerk.getInvitationList).toHaveBeenCalledTimes(2);
  });

  it("does not send a second email when an operation replay finds a pending invitation", async () => {
    clerk.getInvitationList.mockResolvedValue({
      data: [{ emailAddress: "reviewer@example.com" }],
    });
    const inviteReviewer = vi.fn().mockResolvedValue(member);
    const repository = { inviteReviewer } as unknown as ParentingRepository;

    await inviteWorkspaceReviewer(repository, context, {
      email: "reviewer@example.com",
      displayName: "Reviewer",
    });

    expect(inviteReviewer).toHaveBeenCalledTimes(1);
    expect(clerk.createInvitation).not.toHaveBeenCalled();
  });
});
