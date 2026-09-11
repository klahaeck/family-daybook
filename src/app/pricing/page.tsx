import type { Metadata } from "next";
import Link from "next/link";
import { PricingTable } from "@clerk/nextjs";
import { CheckCircle2, ShieldCheck, UsersRound } from "lucide-react";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { clerkConfigured, userIsSignedIn } from "@/lib/auth/identity";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Choose a Family Daybook plan for private family recordkeeping.",
  alternates: { canonical: "/pricing" },
};

const planNotes = [
  {
    icon: ShieldCheck,
    title: "Private by design",
    description: "Your paid plan keeps records inside an authenticated workspace.",
  },
  {
    icon: UsersRound,
    title: "Reviewers are included",
    description:
      "Invited reviewers use the workspace owner’s plan and do not need a separate subscription.",
  },
  {
    icon: CheckCircle2,
    title: "Manage it with Clerk",
    description:
      "Checkout, plan changes, statements, and payment methods stay in your secure account profile.",
  },
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const [signedIn, params] = await Promise.all([
    userIsSignedIn(),
    searchParams,
  ]);
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason;
  const subscriptionRequired = reason === "subscription-required";

  return (
    <MarketingShell signedIn={signedIn}>
      <main>
        <header className="border-b bg-[linear-gradient(180deg,var(--hero-start)_0%,var(--background)_100%)] px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Simple account billing
            </p>
            <h1 className="mt-4 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              Choose the plan for your family daybook.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              The workspace owner manages one paid plan. Invited reviewers are
              covered by that workspace and never need to purchase separate access.
            </p>
          </div>
        </header>

        <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-6xl">
            {subscriptionRequired && (
              <Alert className="mx-auto mb-8 max-w-3xl">
                <AlertTitle>Choose a paid plan to continue</AlertTitle>
                <AlertDescription>
                  Access to the private workspace is checked against the owner’s
                  current Family Daybook plan.
                </AlertDescription>
              </Alert>
            )}

            {clerkConfigured() ? (
              <PricingTable
                for="user"
                newSubscriptionRedirectUrl="/app"
              />
            ) : (
              <div className="mx-auto max-w-2xl rounded-3xl border bg-card p-8 text-center shadow-sm">
                <h2 className="text-2xl font-semibold">Billing preview unavailable</h2>
                <p className="mt-3 leading-7 text-muted-foreground">
                  Clerk Billing is shown in the hosted app. Local demo mode remains
                  available without an account.
                </p>
                <Link
                  href="/app"
                  className={cn(buttonVariants({ size: "lg" }), "mt-6")}
                >
                  Open the local demo
                </Link>
              </div>
            )}

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {planNotes.map((note) => (
                <article key={note.title} className="rounded-2xl border bg-card p-5">
                  <note.icon className="size-5 text-primary" aria-hidden="true" />
                  <h2 className="mt-4 font-semibold">{note.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {note.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
