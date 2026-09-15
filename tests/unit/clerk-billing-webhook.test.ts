import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";

import {
  processClerkBillingWebhook,
  summarizeBillingWebhook,
  verifyClerkPaidCheckout,
  type BillingWebhookReceiptStore,
} from "@/lib/billing/clerk-webhook";
import type {
  BillingCompletionDetails,
  BillingLinkIntentDocument,
  BillingLinkIntentStore,
} from "@/lib/billing/link-intents";

function paymentEvent(
  status: "pending" | "paid" | "failed" = "paid",
  chargeType: "checkout" | "recurring" = "checkout",
  amount = 1200,
) {
  return {
    type: "paymentAttempt.updated",
    object: "event",
    event_attributes: { http_request: { client_ip: "", user_agent: "" } },
    data: {
      id: "payment_attempt_1",
      payer: { user_id: "user_owner" },
      status,
      charge_type: chargeType,
      subscription_items: [{ id: "sub_item_1" }],
      totals: {
        grand_total: { amount, currency: "USD" },
      },
    },
  } as unknown as WebhookEvent;
}

function subscriptionEvent(type: "subscription.active" | "subscription.updated") {
  return {
    type,
    object: "event",
    event_attributes: { http_request: { client_ip: "", user_agent: "" } },
    data: {
      id: "subscription_1",
      payer: { user_id: "user_owner" },
      status: "active",
      items: [
        {
          id: "sub_item_free",
          amount: { amount: 0, currency: "USD" },
        },
      ],
    },
  } as unknown as WebhookEvent;
}

function subscriptionItemEvent() {
  return {
    type: "subscriptionItem.updated",
    object: "event",
    event_attributes: { http_request: { client_ip: "", user_agent: "" } },
    data: {
      id: "sub_item_1",
      payer: { user_id: "user_owner" },
      status: "active",
      amount: { amount: 1200, currency: "USD" },
    },
  } as unknown as WebhookEvent;
}

function receiptStore(claimed = true): BillingWebhookReceiptStore {
  return {
    claim: vi.fn().mockResolvedValue(claimed),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}

function intentStore(): BillingLinkIntentStore {
  return {
    create: vi.fn(),
    supersedeActiveForUser: vi.fn(),
    findByTokenHash: vi.fn(),
    markCheckoutOpened: vi.fn(),
    markCompletedForUser: vi.fn().mockResolvedValue({
      id: "intent_1",
    } as BillingLinkIntentDocument),
  };
}

describe("Clerk Billing webhook processing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("extracts only reporting-safe checkout fields", () => {
    expect(summarizeBillingWebhook("event_1", paymentEvent())).toEqual({
      eventId: "event_1",
      eventType: "paymentAttempt.updated",
      objectId: "payment_attempt_1",
      payerUserId: "user_owner",
      status: "paid",
      subscriptionItemIds: ["sub_item_1"],
      amount: 1200,
      currency: "USD",
      completesCheckout: true,
    });
  });

  it("links a paid checkout to the user's active mobile intent exactly once", async () => {
    const receipts = receiptStore();
    const intents = intentStore();
    const now = new Date("2026-09-15T15:00:00.000Z");
    const verifyPaidCheckout = vi.fn().mockResolvedValue(true);

    await expect(
      processClerkBillingWebhook("event_1", paymentEvent(), {
        receiptStore: receipts,
        intentStore: intents,
        verifyPaidCheckout,
        now,
      }),
    ).resolves.toEqual({
      accepted: true,
      duplicate: false,
      linkedIntent: true,
    });
    expect(intents.markCompletedForUser).toHaveBeenCalledWith(
      "user_owner",
      {
        eventId: "event_1",
        subscriptionItemIds: ["sub_item_1"],
        amount: 1200,
        currency: "USD",
      } satisfies BillingCompletionDetails,
      now,
    );
    expect(verifyPaidCheckout).toHaveBeenCalledWith({
      payerUserId: "user_owner",
      subscriptionItemIds: ["sub_item_1"],
      now,
    });
    expect(receipts.complete).toHaveBeenCalledWith("event_1", now);
  });

  it("does not repeat work for a completed or concurrently claimed event", async () => {
    const receipts = receiptStore(false);
    const intents = intentStore();

    await expect(
      processClerkBillingWebhook("event_1", paymentEvent(), {
        receiptStore: receipts,
        intentStore: intents,
        verifyPaidCheckout: vi.fn().mockResolvedValue(true),
      }),
    ).resolves.toEqual({
      accepted: true,
      duplicate: true,
      linkedIntent: false,
    });
    expect(intents.markCompletedForUser).not.toHaveBeenCalled();
  });

  it("records processing failure so Clerk can retry", async () => {
    const receipts = receiptStore();
    const intents = intentStore();
    vi.mocked(intents.markCompletedForUser).mockRejectedValue(
      new Error("database unavailable"),
    );

    await expect(
      processClerkBillingWebhook("event_1", paymentEvent(), {
        receiptStore: receipts,
        intentStore: intents,
        verifyPaidCheckout: vi.fn().mockResolvedValue(true),
      }),
    ).rejects.toThrow("database unavailable");
    expect(receipts.fail).toHaveBeenCalledWith("event_1", expect.any(Date));
    expect(receipts.complete).not.toHaveBeenCalled();
  });

  it("only verifies matching subscription items against the allowed paid plan", async () => {
    vi.stubEnv("CLERK_ALLOWED_PLAN_SLUGS", "general");
    const client = {
      getUserBillingSubscription: vi.fn().mockResolvedValue({
        subscriptionItems: [
          {
            id: "sub_item_1",
            status: "active",
            periodEnd: null,
            plan: { slug: "general", isDefault: false },
          },
          {
            id: "sub_item_free",
            status: "active",
            periodEnd: null,
            plan: { slug: "free_user", isDefault: true },
          },
        ],
      }),
    };
    const now = new Date("2026-09-15T15:00:00.000Z");

    await expect(
      verifyClerkPaidCheckout(
        {
          payerUserId: "user_owner",
          subscriptionItemIds: ["sub_item_1"],
          now,
        },
        { client },
      ),
    ).resolves.toBe(true);
    await expect(
      verifyClerkPaidCheckout(
        {
          payerUserId: "user_owner",
          subscriptionItemIds: ["sub_item_free"],
          now,
        },
        { client },
      ),
    ).resolves.toBe(false);
    await expect(
      verifyClerkPaidCheckout(
        {
          payerUserId: "user_owner",
          subscriptionItemIds: ["unrelated_item"],
          now,
        },
        { client },
      ),
    ).resolves.toBe(false);
    expect(client.getUserBillingSubscription).toHaveBeenCalledWith("user_owner");
  });

  it("acknowledges a disallowed checkout without completing an intent", async () => {
    const receipts = receiptStore();
    const intents = intentStore();

    await expect(
      processClerkBillingWebhook("event_1", paymentEvent(), {
        receiptStore: receipts,
        intentStore: intents,
        verifyPaidCheckout: vi.fn().mockResolvedValue(false),
      }),
    ).resolves.toEqual({
      accepted: true,
      duplicate: false,
      linkedIntent: false,
    });
    expect(intents.markCompletedForUser).not.toHaveBeenCalled();
    expect(receipts.complete).toHaveBeenCalled();
  });

  it("fails the receipt when subscription verification is unavailable so Clerk retries", async () => {
    const receipts = receiptStore();
    const intents = intentStore();

    await expect(
      processClerkBillingWebhook("event_1", paymentEvent(), {
        receiptStore: receipts,
        intentStore: intents,
        verifyPaidCheckout: vi
          .fn()
          .mockRejectedValue(new Error("Clerk Billing unavailable")),
      }),
    ).rejects.toThrow("Clerk Billing unavailable");
    expect(intents.markCompletedForUser).not.toHaveBeenCalled();
    expect(receipts.fail).toHaveBeenCalledWith("event_1", expect.any(Date));
    expect(receipts.complete).not.toHaveBeenCalled();
  });

  it("does not verify or complete a zero-total checkout", async () => {
    const receipts = receiptStore();
    const intents = intentStore();
    const verifyPaidCheckout = vi.fn().mockResolvedValue(true);
    const event = paymentEvent("paid", "checkout", 0);

    expect(summarizeBillingWebhook("event_1", event)).toMatchObject({
      amount: 0,
      completesCheckout: false,
    });
    await processClerkBillingWebhook("event_1", event, {
      receiptStore: receipts,
      intentStore: intents,
      verifyPaidCheckout,
    });

    expect(verifyPaidCheckout).not.toHaveBeenCalled();
    expect(intents.markCompletedForUser).not.toHaveBeenCalled();
  });

  it("acknowledges non-completing Billing events without opening access", async () => {
    const receipts = receiptStore();
    const intents = intentStore();

    await expect(
      processClerkBillingWebhook("event_1", paymentEvent("pending"), {
        receiptStore: receipts,
        intentStore: intents,
      }),
    ).resolves.toMatchObject({ linkedIntent: false });
    expect(intents.markCompletedForUser).not.toHaveBeenCalled();
    expect(receipts.complete).toHaveBeenCalled();
  });

  it.each([
    ["recurring payment", paymentEvent("paid", "recurring")],
    ["free default subscription activation", subscriptionEvent("subscription.active")],
    ["subscription update", subscriptionEvent("subscription.updated")],
    ["subscription item renewal", subscriptionItemEvent()],
  ])("does not complete a mobile checkout from a %s event", async (_label, event) => {
    const receipts = receiptStore();
    const intents = intentStore();

    expect(summarizeBillingWebhook("event_2", event)).toMatchObject({
      payerUserId: "user_owner",
      completesCheckout: false,
    });

    await expect(
      processClerkBillingWebhook("event_2", event, {
        receiptStore: receipts,
        intentStore: intents,
      }),
    ).resolves.toEqual({
      accepted: true,
      duplicate: false,
      linkedIntent: false,
    });
    expect(intents.markCompletedForUser).not.toHaveBeenCalled();
    expect(receipts.complete).toHaveBeenCalled();
  });
});
