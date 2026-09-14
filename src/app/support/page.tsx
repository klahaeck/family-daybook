import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { SupportForm } from "@/app/support/support-form";

export const metadata: Metadata = {
  title: "Support",
  description: "Send a private support request to Family Daybook.",
  alternates: { canonical: "/support" },
  robots: { index: false, follow: true },
};

export default function SupportPage() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  return (
    <MarketingShell>
      <main>
        <header className="border-b bg-[linear-gradient(180deg,var(--hero-start)_0%,var(--background)_100%)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Private help</p>
            <h1 className="mt-4 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">Family Daybook support</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Send an account, billing, privacy, security, or agent-access question. Your request is delivered privately and is not added to your family records.
            </p>
          </div>
        </header>

        <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-3xl border bg-card p-6 shadow-sm sm:p-10">
            {siteKey ? (
              <SupportForm siteKey={siteKey} />
            ) : (
              <div role="status" className="rounded-2xl border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
                The support form is temporarily unavailable. Please try again later.
              </div>
            )}
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
