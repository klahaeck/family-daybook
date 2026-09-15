import "server-only";

import { clerkConfigured } from "@/lib/auth/identity";
import { getSiteUrl } from "@/lib/metadata/site-url";
import type {
  ParentingRepository,
  RequestContext,
} from "@/lib/repository/repository";

export async function inviteWorkspaceReviewer(
  repository: ParentingRepository,
  context: RequestContext,
  input: { email: string; displayName: string },
) {
  const member = await repository.inviteReviewer(context, input);
  if (clerkConfigured()) {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const email = input.email.toLowerCase();
    const recipientAlreadyExists = async () => {
      const [users, invitations] = await Promise.all([
        client.users.getUserList({ emailAddress: [email], limit: 1 }),
        client.invitations.getInvitationList({
          query: email,
          status: "pending",
          limit: 10,
        }),
      ]);
      return (
        users.data.length > 0 ||
        invitations.data.some(
          (invitation) => invitation.emailAddress.toLowerCase() === email,
        )
      );
    };

    if (!(await recipientAlreadyExists())) {
      try {
        await client.invitations.createInvitation({
          emailAddress: email,
          redirectUrl: new URL("/app", getSiteUrl()).toString(),
          publicMetadata: {
            workspaceId: context.workspace.id,
            role: "reviewer",
          },
        });
      } catch (error) {
        // Clerk can commit the invitation while the response is interrupted.
        // Reconcile before surfacing a retryable failure so replay never sends
        // a duplicate invitation email.
        if (!(await recipientAlreadyExists())) throw error;
      }
    }
  }
  return member;
}
