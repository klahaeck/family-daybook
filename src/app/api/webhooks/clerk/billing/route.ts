import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextResponse, type NextRequest } from "next/server";

import { processClerkBillingWebhook } from "@/lib/billing/clerk-webhook";

export async function POST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
    return NextResponse.json(
      { error: "Billing webhook ingestion is not configured." },
      { status: 503 },
    );
  }

  const eventId = request.headers.get("svix-id")?.trim();
  if (!eventId) {
    return NextResponse.json(
      { error: "Webhook identifier is required." },
      { status: 400 },
    );
  }

  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request);
  } catch {
    return NextResponse.json(
      { error: "Webhook verification failed." },
      { status: 400 },
    );
  }

  try {
    const result = await processClerkBillingWebhook(eventId, event);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Webhook processing is temporarily unavailable." },
      { status: 503 },
    );
  }
}
