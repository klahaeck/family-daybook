import "server-only";

import { clerkConfigured } from "@/lib/auth/identity";
import type { RequestContext } from "@/lib/repository/repository";

export const DEFAULT_PAID_BILLING_PLAN_SLUGS = [
  "general",
] as const;

type BillingSubscriptionItemLike = {
  status: string;
  periodEnd: number | null;
  plan: { slug: string; isDefault: boolean } | null;
};

type PrivateMetadataLike = Record<string, unknown> | null | undefined;

export class SubscriptionRequiredError extends Error {
  constructor() {
    super("SUBSCRIPTION_REQUIRED");
    this.name = "SubscriptionRequiredError";
  }
}

export class BillingAccessUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("BILLING_ACCESS_UNAVAILABLE", options);
    this.name = "BillingAccessUnavailableError";
  }
}

export function isSubscriptionRequiredError(error: unknown): boolean {
  return (
    error instanceof SubscriptionRequiredError ||
    (error instanceof Error && error.message === "SUBSCRIPTION_REQUIRED")
  );
}

export function isBillingAccessUnavailableError(error: unknown): boolean {
  return (
    error instanceof BillingAccessUnavailableError ||
    (error instanceof Error && error.message === "BILLING_ACCESS_UNAVAILABLE")
  );
}

export function allowedBillingPlanSlugs(
  configured = process.env.CLERK_ALLOWED_PLAN_SLUGS,
): Set<string> {
  const slugs = configured
    ?.split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);

  return new Set(
    slugs?.length ? slugs : DEFAULT_PAID_BILLING_PLAN_SLUGS,
  );
}

export function subscriptionItemGrantsAccess(
  item: BillingSubscriptionItemLike,
  allowedPlanSlugs = allowedBillingPlanSlugs(),
  now = Date.now(),
): boolean {
  if (
    !item.plan ||
    item.plan.isDefault ||
    !allowedPlanSlugs.has(item.plan.slug)
  ) {
    return false;
  }
  if (item.status === "active") return true;

  return (
    item.status === "canceled" &&
    item.periodEnd !== null &&
    item.periodEnd > now
  );
}

export function hasAllowedBillingPlan(
  items: BillingSubscriptionItemLike[],
  allowedPlanSlugs = allowedBillingPlanSlugs(),
  now = Date.now(),
): boolean {
  return items.some((item) =>
    subscriptionItemGrantsAccess(item, allowedPlanSlugs, now),
  );
}

export function privateMetadataGrantsComplimentaryAccess(
  privateMetadata: PrivateMetadataLike,
): boolean {
  return privateMetadata?.complimentaryAccess === true;
}

export type WorkspaceBillingState =
  | { status: "active"; source: "subscription" | "complimentary" | "demo" }
  | { status: "subscription_required" }
  | { status: "unavailable" };

export async function getWorkspaceBillingState(
  context: RequestContext,
): Promise<WorkspaceBillingState> {
  if (context.identity.demo || !clerkConfigured()) {
    return { status: "active", source: "demo" };
  }
  if (!context.billingOwnerAuthUserId) return { status: "unavailable" };

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    let billingUnavailable = false;
    try {
      const subscription = await client.billing.getUserBillingSubscription(
        context.billingOwnerAuthUserId,
      );
      if (hasAllowedBillingPlan(subscription.subscriptionItems)) {
        return { status: "active", source: "subscription" };
      }
    } catch {
      billingUnavailable = true;
    }
    try {
      const owner = await client.users.getUser(context.billingOwnerAuthUserId);
      if (privateMetadataGrantsComplimentaryAccess(owner.privateMetadata)) {
        return { status: "active", source: "complimentary" };
      }
    } catch {
      return { status: "unavailable" };
    }
    if (billingUnavailable) return { status: "unavailable" };
    return { status: "subscription_required" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function assertWorkspaceBillingAccess(
  context: RequestContext,
): Promise<void> {
  if (context.identity.demo || !clerkConfigured()) return;
  if (!context.billingOwnerAuthUserId) {
    throw new Error("BILLING_OWNER_REQUIRED");
  }

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    let billingError: unknown;
    let billingCheckFailed = false;

    try {
      const subscription = await client.billing.getUserBillingSubscription(
        context.billingOwnerAuthUserId,
      );

      if (hasAllowedBillingPlan(subscription.subscriptionItems)) {
        return;
      }
    } catch (error) {
      billingCheckFailed = true;
      billingError = error;
    }

    try {
      const owner = await client.users.getUser(context.billingOwnerAuthUserId);
      if (privateMetadataGrantsComplimentaryAccess(owner.privateMetadata)) {
        return;
      }
    } catch (metadataError) {
      throw new BillingAccessUnavailableError({
        cause: new AggregateError(
          billingCheckFailed
            ? [billingError, metadataError]
            : [metadataError],
          "Clerk access checks failed",
        ),
      });
    }

    if (billingCheckFailed) {
      throw new BillingAccessUnavailableError({ cause: billingError });
    }

    throw new SubscriptionRequiredError();
  } catch (error) {
    if (
      isSubscriptionRequiredError(error) ||
      isBillingAccessUnavailableError(error)
    ) {
      throw error;
    }
    throw new BillingAccessUnavailableError({ cause: error });
  }
}
