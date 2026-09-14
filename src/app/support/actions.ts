"use server";

import { z } from "zod";

import { SUPPORT_TOPICS } from "@/app/support/data";

const supportRequestSchema = z.object({
  name: z.string().trim().max(100).optional(),
  replyEmail: z.string().trim().email("Enter a valid reply email."),
  topic: z.enum(SUPPORT_TOPICS, { message: "Choose a support topic." }),
  message: z
    .string()
    .trim()
    .min(10, "Enter at least 10 characters.")
    .max(4000, "Keep the message to 4,000 characters or fewer."),
  turnstileToken: z.string().min(1, "Complete the verification challenge."),
});

export type SupportField = "name" | "replyEmail" | "topic" | "message" | "turnstileToken";

export interface SupportFormState {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Partial<Record<SupportField, string[]>>;
}

export const initialSupportFormState: SupportFormState = {
  status: "idle",
  message: "",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
        cache: "no-store",
      },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as {
      success?: boolean;
      action?: string;
    };
    return result.success === true && result.action === "support_form";
  } catch {
    return false;
  }
}

async function deliverSupportRequest(
  input: z.infer<typeof supportRequestSchema>,
  configuration: { apiKey: string; to: string; from: string },
): Promise<boolean> {
  const senderName = input.name || "Not provided";
  const text = [
    `Topic: ${input.topic}`,
    `Name: ${senderName}`,
    `Reply email: ${input.replyEmail}`,
    "",
    input.message,
  ].join("\n");
  const html = `<p><strong>Topic:</strong> ${escapeHtml(input.topic)}</p><p><strong>Name:</strong> ${escapeHtml(senderName)}</p><p><strong>Reply email:</strong> ${escapeHtml(input.replyEmail)}</p><hr><p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: configuration.from,
        to: [configuration.to],
        reply_to: input.replyEmail,
        subject: `Family Daybook support: ${input.topic}`,
        text,
        html,
      }),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function submitSupportRequest(
  _previousState: SupportFormState,
  formData: FormData,
): Promise<SupportFormState> {
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim()) {
    return {
      status: "success",
      message: "Your request was received.",
    };
  }

  const result = supportRequestSchema.safeParse({
    name: formData.get("name") || undefined,
    replyEmail: formData.get("replyEmail"),
    topic: formData.get("topic"),
    message: formData.get("message"),
    turnstileToken: formData.get("turnstileToken"),
  });
  if (!result.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.SUPPORT_TO_EMAIL?.trim();
  const from = process.env.SUPPORT_FROM_EMAIL?.trim();
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!apiKey || !to || !from || !turnstileSecret) {
    return {
      status: "error",
      message: "Support is temporarily unavailable. Please try again later.",
    };
  }

  if (!(await verifyTurnstile(result.data.turnstileToken, turnstileSecret))) {
    return {
      status: "error",
      message: "Verification could not be completed. Please try again.",
      fieldErrors: {
        turnstileToken: ["Complete the verification challenge again."],
      },
    };
  }

  const delivered = await deliverSupportRequest(result.data, {
    apiKey,
    to,
    from,
  });
  return delivered
    ? { status: "success", message: "Your request was received." }
    : {
        status: "error",
        message: "Support is temporarily unavailable. Please try again later.",
      };
}
