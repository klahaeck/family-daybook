import { afterEach, describe, expect, it, vi } from "vitest";

import {
  initialSupportFormState,
  submitSupportRequest,
} from "@/app/support/actions";

function formData(overrides: Record<string, string> = {}) {
  const values = {
    name: "Example Parent",
    replyEmail: "visitor@example.test",
    topic: "account",
    message: "Please help with this synthetic account question.",
    turnstileToken: "turnstile-token",
    website: "",
    ...overrides,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function configureSupport() {
  vi.stubEnv("RESEND_API_KEY", "resend-test-key");
  vi.stubEnv("SUPPORT_TO_EMAIL", "private-destination@example.test");
  vi.stubEnv("SUPPORT_FROM_EMAIL", "verified-sender@example.test");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("submitSupportRequest", () => {
  it("validates input before external requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const state = await submitSupportRequest(
      initialSupportFormState,
      formData({ replyEmail: "invalid", topic: "unknown", message: "short" }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors).toMatchObject({
      replyEmail: expect.any(Array),
      topic: expect.any(Array),
      message: expect.any(Array),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("silently accepts the honeypot without delivery", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const state = await submitSupportRequest(
      initialSupportFormState,
      formData({ website: "spam.example" }),
    );

    expect(state.status).toBe("success");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not verify or deliver when server configuration is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const state = await submitSupportRequest(initialSupportFormState, formData());

    expect(state).toMatchObject({ status: "error" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a successful Turnstile support action", async () => {
    configureSupport();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, action: "different_action" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const state = await submitSupportRequest(initialSupportFormState, formData());

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.turnstileToken).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("verifies Turnstile and delivers escaped content through Resend", async () => {
    configureSupport();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, action: "support_form" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const state = await submitSupportRequest(
      initialSupportFormState,
      formData({ name: "<Example>", message: "A detailed <script>alert('x')</script> question." }),
    );

    expect(state).toEqual({ status: "success", message: "Your request was received." });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const resendRequest = fetchMock.mock.calls[1];
    const options = resendRequest[1] as RequestInit;
    const body = JSON.parse(String(options.body));
    expect(body.reply_to).toBe("visitor@example.test");
    expect(body.to).toEqual(["private-destination@example.test"]);
    expect(body.html).toContain("&lt;script&gt;");
    expect(body.html).not.toContain("<script>");
  });

  it("returns a generic error when delivery fails", async () => {
    configureSupport();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, action: "support_form" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response("failure", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const state = await submitSupportRequest(initialSupportFormState, formData());
    expect(state).toEqual({
      status: "error",
      message: "Support is temporarily unavailable. Please try again later.",
    });
  });
});
