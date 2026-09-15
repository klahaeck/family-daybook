import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  apiContext,
  apiError,
  apiJson,
  parseJson,
  requireIdempotencyKey,
  requireOwner,
  createBillingLinkIntent,
} = vi.hoisted(() => ({
  apiContext: vi.fn(),
  apiError: vi.fn(),
  apiJson: vi.fn((data: unknown, init: ResponseInit = {}) =>
    Response.json(data, init),
  ),
  parseJson: vi.fn(),
  requireIdempotencyKey: vi.fn(),
  requireOwner: vi.fn(),
  createBillingLinkIntent: vi.fn(),
}));

vi.mock("@/lib/api/v1", () => ({
  apiContext,
  apiError,
  apiJson,
  parseJson,
  requireIdempotencyKey,
  requireOwner,
}));
vi.mock("@/lib/billing/link-intents", async (loadOriginal) => ({
  ...(await loadOriginal<typeof import("@/lib/billing/link-intents")>()),
  createBillingLinkIntent,
}));

import { POST } from "@/app/api/v1/billing/link-intents/route";

describe("mobile billing link intent route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiContext.mockResolvedValue({
      context: {
        identity: { authUserId: "user_owner" },
        member: { role: "owner" },
      },
    });
    parseJson.mockResolvedValue({ platform: "ios" });
    requireIdempotencyKey.mockReturnValue(
      "11223344-5566-4788-9900-aabbccddeeff",
    );
    createBillingLinkIntent.mockResolvedValue({
      id: "intent_1",
      token: "opaque_server_token",
      checkoutUrl:
        "https://www.myfamilydaybook.com/mobile/subscribe?intent=opaque_server_token",
      completionUrl:
        "https://www.myfamilydaybook.com/mobile/complete?intent=opaque_server_token",
      expiresAt: "2026-09-15T15:10:00.000Z",
    });
  });

  it("authenticates without requiring an existing subscription and requires the owner role", async () => {
    await POST(
      new Request(
        "https://www.myfamilydaybook.com/api/v1/billing/link-intents",
        { method: "POST", body: JSON.stringify({ platform: "ios" }) },
      ),
    );

    expect(apiContext).toHaveBeenCalledWith({ requireBilling: false });
    expect(requireOwner).toHaveBeenCalledWith(
      expect.objectContaining({ member: { role: "owner" } }),
    );
    expect(createBillingLinkIntent).toHaveBeenCalledWith({
      authUserId: "user_owner",
      operationId: "11223344-5566-4788-9900-aabbccddeeff",
      platform: "ios",
    });
  });

  it("returns only the short-lived checkout URLs, never the raw intent token field", async () => {
    const response = await POST(
      new Request(
        "https://www.myfamilydaybook.com/api/v1/billing/link-intents",
        { method: "POST", body: JSON.stringify({ platform: "ios" }) },
      ),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ data: { intentId: "intent_1" } });
    expect(body).not.toHaveProperty("token");
    expect(JSON.stringify(body)).not.toContain("user_owner");
  });
});
