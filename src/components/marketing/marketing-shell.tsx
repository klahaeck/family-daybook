import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";

import { BrandLogo } from "@/components/app/brand-logo";
import { DaybookLink } from "@/components/marketing/daybook-link";
import { ThemeToggle } from "@/components/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/agent-access", label: "Agent access" },
  { href: "/pricing", label: "Pricing" },
];

function SessionControl({
  signedIn,
  className,
}: {
  signedIn: boolean;
  className: string;
}) {
  if (!signedIn) {
    return (
      <Link href="/sign-in" className={className}>
        Sign in
      </Link>
    );
  }

  return (
    <SignOutButton redirectUrl="/">
      <button type="button" className={className}>
        Sign out
      </button>
    </SignOutButton>
  );
}

export function MarketingShell({
  children,
  signedIn = false,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-20 lg:px-8">
          <Link href="/" aria-label="Family Daybook home" className="shrink-0">
            <BrandLogo decorative className="w-32 sm:w-48" />
          </Link>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Marketing navigation">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle className="size-10" />
            <SessionControl
              signedIn={signedIn}
              className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "hidden sm:inline-flex")}
            />
            <DaybookLink
              signedIn={signedIn}
              compactLabel={signedIn ? "Open" : "Start"}
              className="h-10 px-4 shadow-sm sm:px-5"
            />
          </div>
        </div>

        <nav
          className="mx-auto flex max-w-7xl items-center justify-center gap-7 overflow-x-auto border-t border-border/60 px-4 py-2.5 lg:hidden"
          aria-label="Mobile marketing navigation"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <SessionControl
            signedIn={signedIn}
            className="shrink-0 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground sm:hidden"
          />
        </nav>
      </header>

      {children}

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <BrandLogo decorative className="w-48" />
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                A private place for clear, factual family records—kept together with care.
              </p>
            </div>
            <nav className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm" aria-label="Footer navigation">
              <Link href="/#features" className="text-muted-foreground hover:text-foreground">Features</Link>
              <Link href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
              <Link href="/co-parenting-recordkeeping" className="text-muted-foreground hover:text-foreground">Co-parenting records</Link>
              <Link href="/agent-access" className="text-muted-foreground hover:text-foreground">Agent access</Link>
              <SessionControl
                signedIn={signedIn}
                className="text-left text-muted-foreground hover:text-foreground"
              />
              <Link href="/privacy" className="text-muted-foreground hover:text-foreground">Privacy</Link>
              <Link href="/terms" className="text-muted-foreground hover:text-foreground">Terms of use</Link>
              <Link href="/support" className="text-muted-foreground hover:text-foreground">Support</Link>
            </nav>
          </div>
          <div className="mt-10 flex flex-col gap-3 border-t pt-6 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-2xl">
              Family Daybook is a factual recordkeeping aid. It is not a substitute for professional advice or emergency services.
            </p>
            <p className="shrink-0">© {new Date().getFullYear()} Family Daybook</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
