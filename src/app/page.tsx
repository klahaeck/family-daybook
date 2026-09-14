import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FileCheck2,
  FileClock,
  History,
  ListChecks,
  LockKeyhole,
  Paperclip,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { AgentAccessFeature } from "@/components/marketing/agent-access-feature";
import { DaybookLink } from "@/components/marketing/daybook-link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { ProductPreview } from "@/components/marketing/product-preview";
import { userIsSignedIn } from "@/lib/auth/identity";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const promises = [
  { icon: LockKeyhole, label: "Private by design", detail: "Authenticated, isolated workspaces" },
  { icon: ListChecks, label: "Built for facts", detail: "Clear details without the clutter" },
  { icon: FileCheck2, label: "Easy to review", detail: "One organized family timeline" },
];

const steps = [
  {
    number: "01",
    title: "Capture the day",
    description: "Log routines, time together, appointments, and important moments while the details are still fresh.",
  },
  {
    number: "02",
    title: "Keep the context",
    description: "Add times, people, notes, and attachments in a consistent structure that stays easy to understand.",
  },
  {
    number: "03",
    title: "Review with clarity",
    description: "Search the timeline, follow correction history, and prepare organized reports when you need a clear picture.",
  },
];

const features = [
  { icon: ListChecks, title: "A steadier daily rhythm", description: "Turn recurring family routines into a simple checklist and add factual notes only when they are useful." },
  { icon: Clock3, title: "One clear timeline", description: "Bring caregiving, appointments, and important moments together in chronological order." },
  { icon: CalendarDays, title: "Appointments in context", description: "Keep schedules, responsibility, arrival details, and outcomes together instead of scattered across messages." },
  { icon: FileClock, title: "Factual incident notes", description: "Record what happened with observable details, exact words, witnesses, actions, and outcomes." },
  { icon: History, title: "Corrections that stay visible", description: "Add a reasoned correction without silently replacing what was recorded before." },
  { icon: FileCheck2, title: "Organized record packages", description: "Create stable snapshots with included records, originals, revision history, and checksum manifests." },
];

const securityPoints = [
  { icon: UserCheck, title: "Access stays intentional", description: "Owners and invited reviewers sign in before reaching family records." },
  { icon: Paperclip, title: "Files stay behind the app", description: "Attachments and generated reports are delivered through authenticated routes, never public links." },
  { icon: ShieldCheck, title: "Workspace boundaries", description: "Each account receives an isolated workspace, with membership and role checks repeated for every private request." },
  { icon: History, title: "Tamper-evident history", description: "Finalized records use server timestamps, append-only corrections, and linked hashes to make later changes easier to detect." },
];

export default async function MarketingHome() {
  const signedIn = await userIsSignedIn();

  return (
    <MarketingShell signedIn={signedIn}>
      <main>
        <section className="relative isolate overflow-hidden">
          <div className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,var(--hero-start)_0%,var(--hero-middle)_62%,var(--background)_100%)]" />
          <div className="absolute -left-40 top-4 -z-10 size-[34rem] rounded-full bg-secondary/80 blur-3xl" />
          <div className="absolute -right-52 top-32 -z-10 size-[38rem] rounded-full bg-[var(--hero-glow)] blur-3xl" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:px-8 lg:py-28">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/75 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Private family recordkeeping
              </div>
              <h1 className="mt-6 max-w-3xl text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-foreground sm:text-6xl lg:text-7xl">
                A calmer way to keep the days that matter clear.
              </h1>
              <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
                Family Daybook brings caregiving, appointments, notes, and important moments into one private, organized timeline—so details stay factual and easy to find.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <DaybookLink signedIn={signedIn} className="h-12 px-6 text-base shadow-lg shadow-primary/15" />
                <Link href="/#how-it-works" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 bg-card/70 px-6 text-base")}>
                  See how it works
                </Link>
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Check className="size-3.5 text-primary" aria-hidden="true" />
                No public records. No advertising. Just your family daybook.
              </p>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className="border-y bg-card" aria-label="Family Daybook principles">
          <div className="mx-auto grid max-w-7xl divide-y px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-8">
            {promises.map((promise) => (
              <div key={promise.label} className="flex items-center gap-4 px-2 py-6 md:px-6 lg:py-8">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
                  <promise.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold">{promise.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{promise.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-32 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">A little structure. A lot more clarity.</p>
              <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Keep the details without carrying them all in your head.</h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">Family life moves quickly. A simple, consistent place to record the day helps important context stay close at hand.</p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {steps.map((step) => (
                <article key={step.number} className="rounded-3xl border bg-card p-7 shadow-sm">
                  <p className="font-mono text-xs font-bold tracking-widest text-primary">{step.number}</p>
                  <h3 className="mt-8 text-2xl font-semibold">{step.title}</h3>
                  <p className="mt-3 leading-7 text-muted-foreground">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-32 bg-[var(--marketing-tint)] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Made for the whole day</p>
              <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Every important detail, in its proper place.</h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">Flexible enough for everyday care, structured enough to stay useful over time.</p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <article key={feature.title} className="rounded-3xl border border-border/80 bg-card/85 p-6 shadow-sm backdrop-blur">
                  <span className="grid size-11 place-items-center rounded-2xl bg-secondary text-primary">
                    <feature.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 text-xl font-semibold">{feature.title}</h3>
                  <p className="mt-3 leading-7 text-muted-foreground">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <AgentAccessFeature />

        <section id="security" className="scroll-mt-32 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] bg-primary text-primary-foreground shadow-[0_28px_80px_rgba(23,72,60,0.18)]">
            <div className="grid gap-12 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[0.78fr_1.22fr] lg:px-14 lg:py-16">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">
                  <LockKeyhole className="size-3.5" aria-hidden="true" />
                  Privacy is part of the structure
                </div>
                <h2 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Family details deserve thoughtful boundaries.</h2>
                <p className="mt-5 max-w-xl text-lg leading-8 text-primary-foreground/75">Family Daybook combines private storage with repeated membership checks, visible revision history, and intentional sharing controls.</p>
                <Link href="/privacy" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold underline decoration-white/30 underline-offset-4 hover:decoration-white">
                  Read our privacy approach
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {securityPoints.map((point) => (
                  <article key={point.title} className="rounded-2xl border border-white/12 bg-white/[0.07] p-5">
                    <point.icon className="size-5 text-[#c9dfcf]" aria-hidden="true" />
                    <h3 className="mt-5 font-heading text-lg font-semibold">{point.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-primary-foreground/70">{point.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 pt-4 sm:px-6 sm:pb-28 lg:px-8">
          <div className="mx-auto max-w-5xl rounded-[2rem] border bg-[linear-gradient(135deg,var(--cta-start),var(--cta-end))] px-6 py-12 text-center shadow-sm sm:px-12 sm:py-16">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Begin with today</p>
            <h2 className="mx-auto mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">A clear family record can start with one ordinary day.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Create your private workspace and give the details that matter a calmer place to live.</p>
            <DaybookLink signedIn={signedIn} className="mt-8 h-12 px-6 text-base shadow-lg shadow-primary/15" />
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
