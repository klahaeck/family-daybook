import { z } from "zod";

import {
  apiContext,
  apiError,
  apiJson,
  parseJson,
  requireIdempotencyKey,
  requireOwner,
} from "@/lib/api/v1";
import {
  BillingLinkIntentError,
  createBillingLinkIntent,
} from "@/lib/billing/link-intents";

const inputSchema = z.discriminatedUnion("platform", [
  z
    .object({
      platform: z.literal("ios"),
    })
    .strict(),
  z
    .object({
      platform: z.literal("android"),
      googleExternalTransactionToken: z.string().min(16).max(4096),
    })
    .strict(),
]);

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, inputSchema);
    const operationId = requireIdempotencyKey(request);
    const { context } = await apiContext({ requireBilling: false });
    requireOwner(context);

    const intent = await createBillingLinkIntent({
      authUserId: context.identity.authUserId,
      operationId,
      ...input,
    });

    return apiJson(
      {
        data: {
          intentId: intent.id,
          checkoutUrl: intent.checkoutUrl,
          completionUrl: intent.completionUrl,
          expiresAt: intent.expiresAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BillingLinkIntentError) {
      if (error.code === "IDEMPOTENCY_CONFLICT") {
        return apiJson(
          {
            error: {
              code: "IDEMPOTENCY_CONFLICT",
              message: "That idempotency key was used for different input.",
            },
          },
          { status: 409 },
        );
      }
      const unavailable = error.code === "GOOGLE_EXTERNAL_LINKS_UNAVAILABLE";
      return apiJson(
        {
          error: {
            code: unavailable ? "SERVICE_UNAVAILABLE" : "VALIDATION_ERROR",
            message: unavailable
              ? "External checkout is not available for Android."
              : "The Google Play external transaction token is invalid.",
          },
        },
        { status: unavailable ? 503 : 400 },
      );
    }
    return apiError(error);
  }
}
