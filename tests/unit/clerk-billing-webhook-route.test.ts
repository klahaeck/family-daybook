import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { verifyWebhook, processClerkBillingWebhook } = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  processClerkBillingWebhook: vi.fn(),
}));

vi.mock("@clerk/nextjs/webhooks", () => ({ verifyWebhook }));
vi.mock("@/lib/billing/clerk-webhook", () => ({ processClerkBillingWebhook }));

import { POST } from "@/app/api/webhooks/clerk/billing/route";

function request(eventId = "event_1") {
  return new NextRequest(
    "https://www.myfamilydaybook.com/api/webhooks/clerk/billing",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": eventId,
        "svix-timestamp": "1",
        "svix-signature": "v1,signature",
      },
      body: "{}",
    },
  );
}

describe("Clerk Billing webhook route", () => {
  beforeEach(() => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "whsec_example");
    vi.resetAllMocks();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects invalid signatures before processing", async () => {
    verifyWebhook.mockRejectedValue(new Error("invalid signature"));
    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(processClerkBillingWebhook).not.toHaveBeenCalled();
  });

  it("fails closed when the Clerk signing secret is missing", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "");
    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(verifyWebhook).not.toHaveBeenCalled();
  });

  it("returns a retryable failure when persistence fails", async () => {
    const event = { type: "subscription.active", data: { id: "sub_1" } };
    verifyWebhook.mockResolvedValue(event);
    processClerkBillingWebhook.mockRejectedValue(new Error("unavailable"));
    const response = await POST(request());

    expect(response.status).toBe(503);
  });

  it("processes the verified event using the signed Svix identifier", async () => {
    const event = { type: "subscription.active", data: { id: "sub_1" } };
    verifyWebhook.mockResolvedValue(event);
    processClerkBillingWebhook.mockResolvedValue({
      accepted: true,
      duplicate: false,
      linkedIntent: true,
    });
    const response = await POST(request("event_signed_1"));

    expect(response.status).toBe(200);
    expect(processClerkBillingWebhook).toHaveBeenCalledWith(
      "event_signed_1",
      event,
    );
  });
});
