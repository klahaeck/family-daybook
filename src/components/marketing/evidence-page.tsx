import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { JsonLd } from "@/components/metadata/json-ld";
import { DaybookLink } from "@/components/marketing/daybook-link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getSiteUrl } from "@/lib/metadata/site-url";
import { pageStructuredData } from "@/lib/metadata/structured-data";

export function EvidencePage({
  signedIn,
  path,
  eyebrow,
  title,
  description,
  children,
  relatedLinks,
}: {
  signedIn: boolean;
  path:
    | "/features/record-integrity"
    | "/features/report-packages"
    | "/features/reviewer-access"
    | "/guides/factual-family-records";
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  relatedLinks: readonly { href: string; label: string }[];
}) {
  const structuredData = pageStructuredData({
    siteUrl: getSiteUrl(),
    path,
    name: title,
    description,
    breadcrumbs: [
      { name: "Family Daybook", path: "/" },
      { name: title, path },
    ],
  });

  return (
    <MarketingShell signedIn={signedIn}>
      <JsonLd data={structuredData} />
      <main>
        <header className="border-b bg-[linear-gradient(180deg,var(--hero-start)_0%,var(--background)_100%)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">Family Daybook</Link>
              <span aria-hidden="true" className="px-2">/</span>
              <span>{path.startsWith("/guides/") ? "Guides" : "Features"}</span>
            </nav>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
            <h1 className="mt-4 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">{title}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{description}</p>
          </div>
        </header>

        <article className="mx-auto max-w-4xl space-y-14 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          {children}
        </article>

        <section className="border-t bg-[var(--marketing-tint)] px-4 py-14 sm:px-6 lg:px-8" aria-labelledby="related-heading">
          <div className="mx-auto max-w-4xl">
            <h2 id="related-heading" className="text-2xl font-semibold">Keep exploring</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {relatedLinks.map((link) => (
                <Link key={link.href} href={link.href} className="flex items-center justify-between rounded-xl border bg-card p-4 font-semibold shadow-sm hover:border-primary/30">
                  {link.label}<ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ))}
            </div>
            <div className="mt-8"><DaybookLink signedIn={signedIn} /></div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
