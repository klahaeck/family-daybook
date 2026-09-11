"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  CircleUserRound,
  ClipboardCheck,
  Clock3,
  CreditCard,
  FileText,
  LogOut,
  Menu,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { SignOutButton, useClerk, UserButton } from "@clerk/nextjs";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandLogo } from "@/components/app/brand-logo";
import { ThemeToggle } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";
import type { Member, Workspace } from "@/lib/domain/types";

const nav = [
  { href: "/app", label: "Today", icon: ClipboardCheck },
  { href: "/app/timeline", label: "Timeline", icon: Clock3 },
  { href: "/app/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/app/incidents", label: "Incidents", icon: ShieldAlert },
  { href: "/app/reports", label: "Reports", icon: FileText },
  {
    href: "/app/special-days",
    label: "Special days",
    icon: CalendarRange,
    ownerOnly: true,
  },
  { href: "/app/settings", label: "Settings", icon: Settings, ownerOnly: true },
];

function Navigation({ onNavigate, role }: { onNavigate?: () => void; role: Member["role"] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="space-y-1">
      {nav.filter((item) => role === "owner" || !item.ownerOnly).map((item) => {
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileAccountButton({
  onOpen,
  role,
}: {
  onOpen: () => void;
  role: Member["role"];
}) {
  const clerk = useClerk();

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-left"
      onClick={() => {
        onOpen();
        clerk.openUserProfile();
      }}
    >
      <CircleUserRound className="size-5" aria-hidden="true" />
      <span>
        <span className="block text-sm font-medium">Manage account</span>
        <span className="block text-xs font-normal text-muted-foreground">
          {role === "owner"
            ? "Profile, security, and billing settings"
            : "Profile and security settings"}
        </span>
      </span>
    </Button>
  );
}

export function AppShell({
  children,
  workspace,
  member,
}: {
  children: React.ReactNode;
  workspace: Workspace;
  member: Member;
}) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  return (
    <div className="min-h-screen w-full min-w-0 bg-[radial-gradient(circle_at_top_left,var(--surface-glow),transparent_36rem)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-background/92 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
        <Link href="/app" aria-label="Family Daybook app home" className="mb-8 px-2 py-1">
          <BrandLogo decorative className="w-[208px]" />
        </Link>
        <Navigation role={member.role} />
        <div className="mt-auto rounded-2xl border bg-card p-3">
          <div className="flex items-center gap-3">
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
              <UserButton />
            ) : (
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary/10 text-primary">DO</AvatarFallback>
              </Avatar>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{member.displayName}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{member.role}</p>
            </div>
            <ThemeToggle className="ml-auto size-8" />
          </div>
          {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && (
            <div className="mt-3 space-y-1">
              {member.role === "owner" && (
                <Link
                  href="/pricing"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "w-full justify-start text-muted-foreground",
                  )}
                >
                  <CreditCard aria-hidden="true" />
                  Plan &amp; billing
                </Link>
              )}
              <SignOutButton redirectUrl="/">
                <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                  <LogOut aria-hidden="true" />
                  Sign out
                </Button>
              </SignOutButton>
            </div>
          )}
        </div>
      </aside>

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 border-b bg-background/88 backdrop-blur-xl lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <Link href="/app" aria-label="Family Daybook app home">
              <BrandLogo decorative className="w-[164px]" />
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
                <SheetTrigger render={<Button variant="outline" size="icon" aria-label="Open navigation" />}>
                  <Menu className="size-4" />
                </SheetTrigger>
                <SheetContent side="right" className="w-72 p-5">
                  <SheetTitle className="mb-6">Navigation</SheetTitle>
                  <Navigation role={member.role} onNavigate={() => setMobileNavigationOpen(false)} />
                  <div className="mt-auto border-t pt-4">
                    <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Account
                    </p>
                    {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
                      <>
                        <MobileAccountButton
                          role={member.role}
                          onOpen={() => setMobileNavigationOpen(false)}
                        />
                        {member.role === "owner" && (
                          <Link
                            href="/pricing"
                            className={cn(
                              buttonVariants({ variant: "ghost" }),
                              "w-full justify-start gap-3 rounded-xl px-3 text-muted-foreground",
                            )}
                            onClick={() => setMobileNavigationOpen(false)}
                          >
                            <CreditCard className="size-5" aria-hidden="true" />
                            Plan &amp; billing
                          </Link>
                        )}
                        <SignOutButton redirectUrl="/">
                          <Button
                            variant="ghost"
                            className="w-full justify-start gap-3 rounded-xl px-3 text-muted-foreground"
                            onClick={() => setMobileNavigationOpen(false)}
                          >
                            <LogOut className="size-5" aria-hidden="true" />
                            Sign out
                          </Button>
                        </SignOutButton>
                      </>
                    ) : (
                      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                        <Avatar className="size-9">
                          <AvatarFallback className="bg-primary/10 text-primary">DO</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{member.displayName}</p>
                          <p className="truncate text-xs text-muted-foreground">Demo account</p>
                        </div>
                      </div>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        {workspace.demo && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            Local demo workspace · Sample records are clearly marked and must not be used as evidence.
          </div>
        )}
        <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-9">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden" aria-label="Mobile primary">
        {nav.slice(0, 5).map((item) => (
          <Link key={item.href} href={item.href} className="flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground">
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      </div>
      {action}
    </div>
  );
}
