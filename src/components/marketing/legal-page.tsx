import { AlertTriangle } from "lucide-react";

import { MarketingShell } from "@/components/marketing/marketing-shell";

export function LegalPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <MarketingShell>
      <main>
        <header className="border-b bg-[linear-gradient(180deg,var(--hero-start)_0%,var(--background)_100%)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
            <h1 className="mt-4 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">{title}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">{description}</p>
            <p className="mt-5 text-sm font-medium text-muted-foreground">Effective July 16, 2026</p>
          </div>
        </header>

        <div className="mx-auto grid max-w-4xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p>
              <strong>Draft placeholders:</strong> The operator name, mailing address, contact email, and governing jurisdiction must be replaced and reviewed before production launch.
            </p>
          </div>
          <article className="space-y-10 text-[1.02rem] leading-8 text-foreground/85">
            {children}
          </article>
        </div>
      </main>
    </MarketingShell>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-sm font-semibold text-amber-950 ring-1 ring-amber-300 dark:bg-amber-950/70 dark:text-amber-100 dark:ring-amber-800">
      {children}
    </span>
  );
}
