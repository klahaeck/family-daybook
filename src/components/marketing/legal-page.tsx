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
            <p className="mt-5 text-sm font-medium text-muted-foreground">Effective September 14, 2026</p>
          </div>
        </header>

        <div className="mx-auto grid max-w-4xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
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
