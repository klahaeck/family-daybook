import type { Metadata } from "next";
import { PricingTable, SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { clerkConfigured } from "@/lib/auth/identity";
import {
  BillingLinkIntentError,
  billingLinkUrls,
  markBillingCheckoutOpened,
} from "@/lib/billing/link-intents";

export const metadata: Metadata = {
  title: "Mobile subscription",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validIntentToken(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{43}$/.test(value));
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,var(--surface-glow),transparent_34rem)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl">{children}</div>
    </main>
  );
}

function Unavailable({ expired = false }: { expired?: boolean }) {
  return (
    <PageShell>
      <section className="mx-auto max-w-xl rounded-3xl border bg-card p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Family Daybook mobile
        </p>
        <h1 className="mt-3 text-3xl font-semibold">
          {expired ? "This checkout link has expired" : "Checkout is unavailable"}
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          Return to the mobile app and request a new secure checkout link.
        </p>
        <Link className="mt-6 inline-flex text-sm font-semibold text-primary underline" href="/">
          Open Family Daybook on the web
        </Link>
      </section>
    </PageShell>
  );
}

export default async function MobileSubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[] }>;
}) {
  const token = first((await searchParams).intent);
  if (!clerkConfigured() || !validIntentToken(token)) return <Unavailable />;

  const returnPath = `/mobile/subscribe?intent=${encodeURIComponent(token)}`;
  const { userId } = await auth();
  if (!userId) {
    return (
      <PageShell>
        <section className="mx-auto max-w-md space-y-6 text-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Secure mobile checkout
            </p>
            <h1 className="mt-3 text-3xl font-semibold">Sign in to continue</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Use the same Family Daybook account that requested this link.
            </p>
          </div>
          <SignIn forceRedirectUrl={returnPath} />
        </section>
      </PageShell>
    );
  }

  let intent;
  try {
    intent = await markBillingCheckoutOpened(token, userId);
  } catch (error) {
    if (error instanceof BillingLinkIntentError) {
      return <Unavailable expired={error.code === "BILLING_LINK_EXPIRED"} />;
    }
    return <Unavailable />;
  }

  const { completionUrl } = billingLinkUrls(token);
  if (intent.status === "completed") {
    return (
      <PageShell>
        <section className="mx-auto max-w-xl rounded-3xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-3xl font-semibold">Subscription already confirmed</h1>
          <p className="mt-4 text-muted-foreground">
            Return to Family Daybook to continue.
          </p>
          <a className="mt-6 inline-flex font-semibold text-primary underline" href={completionUrl}>
            Return to the mobile app
          </a>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <header className="mx-auto mb-8 max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Secure mobile checkout
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Choose your Family Daybook plan</h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          Clerk handles checkout on the web. Apple and Google do not process this payment.
        </p>
      </header>
      <PricingTable for="user" newSubscriptionRedirectUrl={completionUrl} />
    </PageShell>
  );
}
