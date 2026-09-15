import { afterEach, describe, expect, it, vi } from "vitest";

import {
  billingLinkUrls,
  createBillingLinkIntent,
  decryptGoogleExternalTransactionToken,
  getBillingLinkIntentForUser,
  markBillingCheckoutOpened,
  type BillingLinkIntentDocument,
  type BillingLinkIntentStore,
} from "@/lib/billing/link-intents";

class MemoryBillingLinkIntentStore implements BillingLinkIntentStore {
  intents: BillingLinkIntentDocument[] = [];

  async create(intent: BillingLinkIntentDocument): Promise<void> {
    this.intents.push(intent);
  }

  async supersedeActiveForUser(
    authUserId: string,
    now: Date,
    exceptId?: string,
  ): Promise<void> {
    for (const intent of this.intents) {
      if (
        intent.authUserId === authUserId &&
        intent.id !== exceptId &&
        (intent.status === "created" || intent.status === "checkout_opened")
      ) {
        intent.status = "superseded";
        intent.updatedAt = now;
      }
    }
  }

  async findByTokenHash(value: string): Promise<BillingLinkIntentDocument | null> {
    return this.intents.find((intent) => intent.tokenHash === value) ?? null;
  }

  async findByOperation(
    authUserId: string,
    operationId: string,
  ): Promise<BillingLinkIntentDocument | null> {
    return (
      this.intents.find(
        (intent) =>
          intent.authUserId === authUserId &&
          intent.operationId === operationId,
      ) ?? null
    );
  }

  async markCheckoutOpened(id: string, now: Date): Promise<void> {
    const intent = this.intents.find((item) => item.id === id);
    if (!intent) return;
    intent.status = "checkout_opened";
    intent.checkoutOpenedAt = now;
  }

  async markCompletedForUser(): Promise<BillingLinkIntentDocument | null> {
    return null;
  }
}

const now = new Date("2026-09-15T15:00:00.000Z");

describe("mobile billing link intents", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates an opaque, short-lived, server-origin checkout URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.myfamilydaybook.com");
    const store = new MemoryBillingLinkIntentStore();
    const created = await createBillingLinkIntent(
      { authUserId: "user_owner", platform: "ios" },
      { store, now },
    );

    expect(created.checkoutUrl).toBe(
      `https://www.myfamilydaybook.com/mobile/subscribe?intent=${created.token}`,
    );
    expect(created.completionUrl).toBe(
      `https://www.myfamilydaybook.com/mobile/complete?intent=${created.token}`,
    );
    expect(created.expiresAt).toBe("2026-09-15T15:10:00.000Z");
    expect(created.checkoutUrl).not.toContain("user_owner");
    expect(store.intents[0]?.tokenHash).not.toBe(created.token);
  });

  it("binds checkout access to the Clerk user that created the intent", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.myfamilydaybook.com");
    const store = new MemoryBillingLinkIntentStore();
    const created = await createBillingLinkIntent(
      { authUserId: "user_owner", platform: "ios" },
      { store, now },
    );

    await expect(
      getBillingLinkIntentForUser(created.token, "different_user", {
        store,
        now,
      }),
    ).rejects.toMatchObject({ code: "BILLING_LINK_NOT_FOUND" });

    await expect(
      markBillingCheckoutOpened(created.token, "user_owner", { store, now }),
    ).resolves.toMatchObject({ status: "checkout_opened" });
  });

  it("expires old checkout links and supersedes earlier active links", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.myfamilydaybook.com");
    const store = new MemoryBillingLinkIntentStore();
    const first = await createBillingLinkIntent(
      { authUserId: "user_owner", platform: "ios" },
      { store, now },
    );
    await createBillingLinkIntent(
      { authUserId: "user_owner", platform: "ios" },
      { store, now: new Date(now.getTime() + 1_000) },
    );

    await expect(
      getBillingLinkIntentForUser(first.token, "user_owner", { store, now }),
    ).rejects.toMatchObject({ code: "BILLING_LINK_EXPIRED" });
  });

  it("fails Android checkout closed until the Play program and encryption are configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.myfamilydaybook.com");
    const store = new MemoryBillingLinkIntentStore();
    await expect(
      createBillingLinkIntent(
        {
          authUserId: "user_owner",
          platform: "android",
          googleExternalTransactionToken: "play-token-long-enough",
        },
        { store, now, environment: process.env },
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "GOOGLE_EXTERNAL_LINKS_UNAVAILABLE",
      }),
    );
  });

  it("encrypts, rather than stores, the one-use Google external transaction token", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.myfamilydaybook.com");
    const store = new MemoryBillingLinkIntentStore();
    const rawToken = "play-token-long-enough";
    await createBillingLinkIntent(
      {
        authUserId: "user_owner",
        platform: "android",
        googleExternalTransactionToken: rawToken,
      },
      {
        store,
        now,
        environment: {
          GOOGLE_PLAY_EXTERNAL_CONTENT_LINKS_ENABLED: "true",
          GOOGLE_PLAY_EXTERNAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString(
            "base64",
          ),
        },
      },
    );

    const encrypted = store.intents[0]?.googleExternal?.encryptedTransactionToken;
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(rawToken);
    expect(
      decryptGoogleExternalTransactionToken(encrypted!, {
        GOOGLE_PLAY_EXTERNAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString(
          "base64",
        ),
      }),
    ).toBe(rawToken);
  });

  it("always builds same-origin web and universal-link URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.myfamilydaybook.com");
    expect(billingLinkUrls("opaque_token")).toEqual({
      checkoutUrl:
        "https://www.myfamilydaybook.com/mobile/subscribe?intent=opaque_token",
      completionUrl:
        "https://www.myfamilydaybook.com/mobile/complete?intent=opaque_token",
    });
  });

  it("replays the same billing intent for the same idempotency key", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.myfamilydaybook.com");
    const store = new MemoryBillingLinkIntentStore();
    const input = {
      authUserId: "user_owner",
      platform: "ios" as const,
      operationId: "11223344-5566-4788-9900-aabbccddeeff",
    };
    const options = {
      store,
      now,
      idempotencySecret: "test-secret",
    };

    const first = await createBillingLinkIntent(input, options);
    const replay = await createBillingLinkIntent(input, options);

    expect(replay).toEqual(first);
    expect(store.intents).toHaveLength(1);
  });

  it("rejects an idempotency key reused for different billing input", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.myfamilydaybook.com");
    const store = new MemoryBillingLinkIntentStore();
    const operationId = "11223344-5566-4788-9900-aabbccddeeff";
    await createBillingLinkIntent(
      { authUserId: "user_owner", platform: "ios", operationId },
      { store, now, idempotencySecret: "test-secret" },
    );

    await expect(
      createBillingLinkIntent(
        {
          authUserId: "user_owner",
          platform: "android",
          operationId,
          googleExternalTransactionToken: "play-token-long-enough",
        },
        {
          store,
          now,
          idempotencySecret: "test-secret",
          environment: {
            GOOGLE_PLAY_EXTERNAL_CONTENT_LINKS_ENABLED: "true",
            GOOGLE_PLAY_EXTERNAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(
              32,
              7,
            ).toString("base64"),
          },
        },
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});
