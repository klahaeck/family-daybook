import "server-only";

export interface Identity {
  authUserId: string;
  email: string;
  displayName: string;
  mfaEnabled: boolean;
  demo: boolean;
}

export function clerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

export async function userIsSignedIn(): Promise<boolean> {
  if (!clerkConfigured()) return false;

  const { auth } = await import("@clerk/nextjs/server");
  return Boolean((await auth()).userId);
}

export async function getIdentity(): Promise<Identity> {
  if (!clerkConfigured()) {
    return {
      authUserId: "demo_owner",
      email: "owner@example.local",
      displayName: "Demo owner",
      mfaEnabled: true,
      demo: true,
    };
  }

  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const session = await auth();
  if (!session.userId) {
    const { redirect } = await import("next/navigation");
    redirect("/sign-in");
  }

  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  return identityFromClerkUser(user);
}

function identityFromClerkUser(user: {
  id: string;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
  primaryEmailAddressId: string | null;
  firstName: string | null;
  lastName: string | null;
  twoFactorEnabled: boolean;
}): Identity {
  const primaryEmail =
    user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) throw new Error("EMAIL_REQUIRED");

  return {
    authUserId: user.id,
    email: primaryEmail.toLowerCase(),
    displayName:
      [user.firstName, user.lastName].filter(Boolean).join(" ") || primaryEmail,
    mfaEnabled: user.twoFactorEnabled,
    demo: false,
  };
}

export async function getIdentityForAuthUserId(
  authUserId: string,
): Promise<Identity> {
  if (!clerkConfigured()) throw new Error("MCP_UNAVAILABLE");
  const { clerkClient } = await import("@clerk/nextjs/server");
  const user = await (await clerkClient()).users.getUser(authUserId);
  return identityFromClerkUser(user);
}
