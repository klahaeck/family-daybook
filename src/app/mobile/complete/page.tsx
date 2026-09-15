import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { clerkConfigured } from "@/lib/auth/identity";
import {
  BillingLinkIntentError,
  billingLinkUrls,
  getBillingLinkIntentForUser,
} from "@/lib/billing/link-intents";

export const metadata: Metadata = {
  title: "Subscription return",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validIntentToken(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{43}$/.test(value));
}

export default async function MobileCheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[] }>;
}) {
  const token = first((await searchParams).intent);
  const shell = (content: React.ReactNode) => (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,var(--surface-glow),transparent_34rem)] p-4">
      {content}
    </main>
  );

  if (!clerkConfigured() || !validIntentToken(token)) {
    return shell(
      <section className="max-w-xl rounded-3xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold">Return link unavailable</h1>
        <p className="mt-4 text-muted-foreground">
          Return to the mobile app and refresh your subscription status.
        </p>
      </section>,
    );
  }

  const returnPath = `/mobile/complete?intent=${encodeURIComponent(token)}`;
  const { userId } = await auth();
  if (!userId) {
    return shell(<SignIn forceRedirectUrl={returnPath} />);
  }

  let intent;
  try {
    intent = await getBillingLinkIntentForUser(token, userId);
  } catch (error) {
    const expired =
      error instanceof BillingLinkIntentError &&
      error.code === "BILLING_LINK_EXPIRED";
    return shell(
      <section className="max-w-xl rounded-3xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold">
          {expired ? "This return link has expired" : "Return link unavailable"}
        </h1>
        <p className="mt-4 text-muted-foreground">
          Return to the mobile app and refresh your subscription status.
        </p>
      </section>,
    );
  }

  const { completionUrl } = billingLinkUrls(token);
  const confirmed = intent.status === "completed";
  return shell(
    <section className="max-w-xl rounded-3xl border bg-card p-8 text-center shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
        Family Daybook mobile
      </p>
      <h1 className="mt-3 text-3xl font-semibold">
        {confirmed ? "Subscription confirmed" : "Checkout finished"}
      </h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        {confirmed
          ? "Your plan is ready. Return to the mobile app to continue."
          : "We are confirming the result with Clerk. Return to the mobile app; it will refresh your access automatically."}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-4">
        <a className="font-semibold text-primary underline" href={completionUrl}>
          Return to the mobile app
        </a>
        <Link className="font-semibold text-primary underline" href="/app">
          Continue on the web
        </Link>
      </div>
    </section>,
  );
}
