import "server-only";
import { cache } from "react";

import {
  assertWorkspaceBillingAccess,
  isSubscriptionRequiredError,
} from "@/lib/auth/billing";
import { clerkConfigured, getIdentity } from "@/lib/auth/identity";
import { mongoConfigured } from "@/lib/db/mongodb";
import type { ParentingRepository, RequestContext } from "./repository";
import type { Identity } from "@/lib/auth/identity";
import type {
  AgentRequestAttribution,
  OperationRequestAttribution,
} from "@/lib/agents/types";
import { MemoryParentingRepository } from "./memory-repository";

let repository: ParentingRepository | undefined;

export async function getRepository(): Promise<ParentingRepository> {
  if (repository) return repository;
  if (mongoConfigured()) {
    const { MongoParentingRepository } = await import("./mongo-repository");
    repository = new MongoParentingRepository();
    return repository;
  }
  if (clerkConfigured()) throw new Error("MONGODB_REQUIRED");
  repository = new MemoryParentingRepository();
  return repository;
}

export async function getRequestContext(): Promise<RequestContext> {
  const identity = await getIdentity();
  return getRequestContextForIdentity(identity);
}

export async function getRequestContextForIdentity(
  identity: Identity,
  agent?: AgentRequestAttribution,
  operation?: OperationRequestAttribution,
): Promise<RequestContext> {
  const repo = await getRepository();
  const context = { ...(await repo.resolveContext(identity)), agent, operation };
  await assertWorkspaceBillingAccess(context);
  return context;
}

// Deduplicate layout/page access checks per server render, never across users.
export const getPageRequestContext = cache(async (): Promise<RequestContext> => {
  try {
    return await getRequestContext();
  } catch (error) {
    if (isSubscriptionRequiredError(error)) {
      const { redirect } = await import("next/navigation");
      redirect("/pricing?reason=subscription-required");
    }
    throw error;
  }
});

export function resetRepositoryForTests(): void {
  repository = undefined;
}
