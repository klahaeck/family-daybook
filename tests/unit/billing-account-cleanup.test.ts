import { describe, expect, it, vi } from "vitest";

import {
  cancelClerkBillingForAuthUser,
  deleteBillingDataForAuthUser,
  type BillingDataCleanupStore,
  type ClerkBillingCancellationClient,
  type ClerkBillingSubscriptionItemLike,
} from "@/lib/billing/account-cleanup";

function subscriptionItem(
  id: string,
  overrides: Partial<ClerkBillingSubscriptionItemLike> = {},
): ClerkBillingSubscriptionItemLike {
  return {
    id,
    status: "active",
    amount: { amount: 1200 },
    plan: {
      isDefault: false,
      fee: { amount: 1200 },
      annualFee: { amount: 12_000 },
    },
    ...overrides,
  };
}

function cancellationClient(
  subscriptionItems: ClerkBillingSubscriptionItemLike[],
): ClerkBillingCancellationClient {
  return {
    getUserBillingSubscription: vi
      .fn()
      .mockResolvedValue({ subscriptionItems }),
    cancelSubscriptionItem: vi.fn().mockResolvedValue(undefined),
  };
}

describe("billing account cleanup", () => {
  it("immediately cancels every nonterminal paid non-default item", async () => {
    const client = cancellationClient([
      subscriptionItem("active_paid"),
      subscriptionItem("canceling_paid", { status: "canceled" }),
      subscriptionItem("past_due_paid", { status: "past_due" }),
      subscriptionItem("upcoming_paid", { status: "upcoming" }),
      subscriptionItem("incomplete_paid", { status: "incomplete" }),
      subscriptionItem("discounted_paid", {
        amount: { amount: 0 },
        plan: { isDefault: false, fee: { amount: 1200 } },
      }),
      subscriptionItem("default_free", {
        amount: { amount: 0 },
        plan: { isDefault: true, fee: { amount: 0 } },
      }),
      subscriptionItem("non_default_free", {
        amount: { amount: 0 },
        plan: {
          isDefault: false,
          fee: { amount: 0 },
          annualFee: { amount: 0 },
        },
      }),
      subscriptionItem("ended_paid", { status: "ended" }),
      subscriptionItem("expired_paid", { status: "expired" }),
      subscriptionItem("abandoned_paid", { status: "abandoned" }),
    ]);

    await expect(
      cancelClerkBillingForAuthUser("user_owner", { client }),
    ).resolves.toEqual({
      canceledSubscriptionItemIds: [
        "active_paid",
        "canceling_paid",
        "past_due_paid",
        "upcoming_paid",
        "incomplete_paid",
        "discounted_paid",
      ],
    });
    expect(client.getUserBillingSubscription).toHaveBeenCalledWith("user_owner");
    expect(client.cancelSubscriptionItem).toHaveBeenNthCalledWith(
      1,
      "active_paid",
      { endNow: true },
    );
    expect(client.cancelSubscriptionItem).toHaveBeenNthCalledWith(
      2,
      "canceling_paid",
      { endNow: true },
    );
    expect(client.cancelSubscriptionItem).toHaveBeenNthCalledWith(
      3,
      "past_due_paid",
      { endNow: true },
    );
    expect(client.cancelSubscriptionItem).toHaveBeenNthCalledWith(
      4,
      "upcoming_paid",
      { endNow: true },
    );
    expect(client.cancelSubscriptionItem).toHaveBeenNthCalledWith(
      5,
      "incomplete_paid",
      { endNow: true },
    );
    expect(client.cancelSubscriptionItem).toHaveBeenNthCalledWith(
      6,
      "discounted_paid",
      { endNow: true },
    );
  });

  it("is safe to retry after Clerk reports a previously canceled item as ended", async () => {
    const client = cancellationClient([]);
    vi.mocked(client.getUserBillingSubscription)
      .mockResolvedValueOnce({
        subscriptionItems: [subscriptionItem("paid_item")],
      })
      .mockResolvedValueOnce({
        subscriptionItems: [
          subscriptionItem("paid_item", { status: "ended" }),
        ],
      });

    await cancelClerkBillingForAuthUser("user_owner", { client });
    await cancelClerkBillingForAuthUser("user_owner", { client });

    expect(client.getUserBillingSubscription).toHaveBeenCalledTimes(2);
    expect(client.cancelSubscriptionItem).toHaveBeenCalledTimes(1);
  });

  it("propagates a Clerk cancellation rejection so account deletion can retry", async () => {
    const client = cancellationClient([subscriptionItem("past_due_paid")]);
    vi.mocked(client.cancelSubscriptionItem).mockRejectedValue(
      new Error("state cannot be canceled yet"),
    );

    await expect(
      cancelClerkBillingForAuthUser("user_owner", { client }),
    ).rejects.toThrow("state cannot be canceled yet");
    expect(client.cancelSubscriptionItem).toHaveBeenCalledWith(
      "past_due_paid",
      { endNow: true },
    );
  });

  it("deletes checkout links and de-identifies retained compliance records", async () => {
    const store: BillingDataCleanupStore = {
      deleteLinkIntents: vi.fn().mockResolvedValue(2),
      redactGoogleTransactions: vi.fn().mockResolvedValue(1),
      redactWebhookReceipts: vi.fn().mockResolvedValue(3),
    };
    const now = new Date("2026-09-15T15:00:00.000Z");

    await expect(
      deleteBillingDataForAuthUser("user_owner", {
        store,
        now,
        redactionId: "deleted_subject_1",
      }),
    ).resolves.toEqual({
      deletedLinkIntents: 2,
      redactedGoogleTransactions: 1,
      redactedWebhookReceipts: 3,
    });
    expect(store.deleteLinkIntents).toHaveBeenCalledWith("user_owner");
    expect(store.redactGoogleTransactions).toHaveBeenCalledWith(
      "user_owner",
      "deleted_subject_1",
      now,
    );
    expect(store.redactWebhookReceipts).toHaveBeenCalledWith(
      "user_owner",
      "deleted_subject_1",
      now,
    );
  });
});
