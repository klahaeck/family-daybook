import { NextResponse } from "next/server";

import {
  isBillingAccessUnavailableError,
  isSubscriptionRequiredError,
} from "@/lib/auth/billing";

export function privateRouteError(error: unknown): NextResponse {
  const code = error instanceof Error ? error.message : undefined;
  if (code === "NOT_FOUND") {
    return NextResponse.json(
      { code: "NOT_FOUND", error: "The requested record was not found." },
      { status: 404 },
    );
  }
  if (code === "FORBIDDEN") {
    return NextResponse.json(
      { code: "FORBIDDEN", error: "You do not have access to this resource." },
      { status: 403 },
    );
  }
  if (isSubscriptionRequiredError(error)) {
    return NextResponse.json(
      {
        code: "SUBSCRIPTION_REQUIRED",
        error: "A paid Family Daybook plan is required.",
      },
      { status: 403 },
    );
  }

  if (isBillingAccessUnavailableError(error)) {
    return NextResponse.json(
      {
        code: "BILLING_ACCESS_UNAVAILABLE",
        error: "Billing access could not be verified. Please try again.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
