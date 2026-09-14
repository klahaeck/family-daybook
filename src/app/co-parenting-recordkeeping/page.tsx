import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  Clock3,
  FileCheck2,
  HeartHandshake,
  History,
  ListChecks,
  LockKeyhole,
  MessageCircleOff,
  Paperclip,
  Search,
  Share2,
  Sparkles,
  UserCheck,
} from "lucide-react";

import { DaybookLink } from "@/components/marketing/daybook-link";
import { AgentAccessFeature } from "@/components/marketing/agent-access-feature";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { JsonLd } from "@/components/metadata/json-ld";
import { ProductPreview } from "@/components/marketing/product-preview";
import { buttonVariants } from "@/components/ui/button";
import { userIsSignedIn } from "@/lib/auth/identity";
import { getSiteUrl } from "@/lib/metadata/site-url";
import { pageStructuredData } from "@/lib/metadata/structured-data";
import { cn } from "@/lib/utils";

const title = "Co-Parenting Documentation & Family Timeline | Family Daybook";
const description =
  "Private recordkeeping for separated and co-parenting families. Log caregiving, appointments, factual notes, and important events in one organized timeline.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/co-parenting-recordkeeping" },
  openGraph: {
    type: "website",
    siteName: "Family Daybook",
    title,
    description,
    url: "/co-parenting-recordkeeping",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/twitter-image"],
  },
  robots: { index: true, follow: true },
};

const recordTypes = [
  {
    icon: HeartHandshake,
    title: "Caregiving routines and parenting time",
    description:
      "Keep everyday care, time together, school routines, meals, and other practical details in one consistent co-parenting log.",
  },
  {
    icon: CalendarDays,
    title: "Appointments and family plans",
    description:
      "Record school, medical, and family appointments with dates, responsibilities, arrival details, and outcomes.",
  },
  {
    icon: Clock3,
    title: "Handoffs and schedule changes",
    description:
      "Note when plans changed, what was agreed, and the practical details that help the family timeline remain understandable.",
  },
  {
    icon: ListChecks,
    title: "Clear, factual incident notes",
    description:
      "Capture what happened, who was present, actions taken, and outcomes using observable details rather than assumptions or accusations.",
  },
  {
    icon: Paperclip,
    title: "Files and useful context",
    description:
      "Keep relevant attachments and supporting context with the entry they belong to, so organized family records are easier to review later.",
  },
];

const historyPoints = [
  {
    icon: History,
    title: "Corrections remain visible",
    description:
      "A correction adds a new revision with its own reason and timestamp. It does not silently replace the version recorded before it.",
  },
  {
    icon: Search,
    title: "One searchable family timeline",
    description:
      "Caregiving, appointments, and factual notes can be searched and filtered together in chronological order.",
  },
  {
    icon: FileCheck2,
    title: "Records prepared for review",
    description:
      "When a clearer review is needed, prepare an organized report package with the selected records, attachments, and revision history.",
  },
];

const privacyPoints = [
  {
    icon: LockKeyhole,
    title: "A private workspace",
    description:
      "Your family recordkeeping stays inside an authenticated workspace rather than on a public profile or feed.",
  },
  {
    icon: Share2,
    title: "Intentional sharing",
    description:
      "Workspace owners decide when to invite a reviewer and can manage that reviewer’s access.",
  },
  {
    icon: UserCheck,
    title: "Sign-in required for reviewers",
    description:
      "Invited reviewers sign in before they can reach the family records shared through the workspace.",
  },
  {
    icon: Paperclip,
    title: "No public file links",
    description:
      "Attachments and generated reports are delivered through authenticated routes, not published as public links.",
  },
];

const faqs = [
  {
    question: "What can I record in Family Daybook?",
    answer:
      "You can record caregiving routines, appointments, important events, factual notes, attachments, and the relevant context that helps each entry remain understandable over time.",
  },
  {
    question: "Is Family Daybook a co-parent messaging app?",
    answer:
      "No. Family Daybook is a private family recordkeeping tool. Sharing is intentional and controlled by the workspace owner; it is not a shared co-parent messaging service.",
  },
  {
    question: "Can I correct an entry?",
    answer:
      "Yes. A correction is added as a new revision with its own reason and timestamp, while the prior version remains available in the entry’s revision history.",
  },
  {
    question: "Is Family Daybook legal advice or an emergency service?",
    answer:
      "No. It is a factual recordkeeping aid. Seek qualified local legal, therapeutic, mediation, parenting-coordination, or emergency help when you need that support.",
  },
];

export default async function CoParentingRecordkeepingPage() {
  const signedIn = await userIsSignedIn();
  const structuredData = pageStructuredData({
    siteUrl: getSiteUrl(),
    path: "/co-parenting-recordkeeping",
    name: title,
    description,
    breadcrumbs: [
      { name: "Family Daybook", path: "/" },
      { name: "Co-parenting recordkeeping", path: "/co-parenting-recordkeeping" },
    ],
    faqs,
  });

  return (
    <MarketingShell signedIn={signedIn}>
      <JsonLd data={structuredData} />
      <main>
        <section className="relative isolate overflow-hidden">
          <div className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,var(--hero-start)_0%,var(--hero-middle)_66%,var(--background)_100%)]" />
          <div className="absolute -left-48 top-0 -z-10 size-[36rem] rounded-full bg-secondary/80 blur-3xl" />
          <div className="absolute -right-52 top-36 -z-10 size-[38rem] rounded-full bg-[var(--hero-glow)] blur-3xl" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.94fr_1.06fr] lg:gap-16 lg:px-8 lg:py-28">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/75 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Calm co-parenting documentation
              </div>
              <h1 className="mt-6 max-w-3xl text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-foreground sm:text-6xl lg:text-7xl">
                A clear family timeline for co-parenting and separation
              </h1>
              <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
                When family details live across messages, calendars, and memories, it can be hard to keep the full picture clear. Family Daybook gives you one private place to record caregiving, appointments, routines, factual notes, and important everyday events while the details are still fresh.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <DaybookLink
                  signedIn={signedIn}
                  signedOutLabel="Create your private workspace"
                  className="h-12 px-6 text-base shadow-lg shadow-primary/15"
                />
                <Link
                  href="#how-it-works"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-12 bg-card/70 px-6 text-base",
                  )}
                >
                  See how Family Daybook works
                </Link>
              </div>
              <p className="mt-4 flex items-start gap-2 text-xs font-medium leading-5 text-muted-foreground">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                Private family recordkeeping for clear details—not conflict, accusations, or public posting.
              </p>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className="border-y bg-card" aria-label="Family Daybook recordkeeping principles">
          <div className="mx-auto grid max-w-7xl divide-y px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-8">
            {[
              ["Private by design", "Records stay in your workspace"],
              ["Built for factual detail", "Observable notes with useful context"],
              ["Organized over time", "One chronological private family timeline"],
            ].map(([label, detail]) => (
              <div key={label} className="px-2 py-6 md:px-6 lg:py-8">
                <p className="font-semibold text-primary">{label}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-32 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Keep the details in one place</p>
              <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                Parenting documentation that stays practical and grounded.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                A consistent appointment and caregiving log can help separated parents keep everyday details organized without asking memory to do all the work. Record what you observed, what happened next, and the context needed to understand the entry later.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {recordTypes.map((record, index) => (
                <article
                  key={record.title}
                  className={cn(
                    "rounded-3xl border bg-card p-6 shadow-sm",
                    index < 2 ? "lg:col-span-3" : "lg:col-span-2",
                  )}
                >
                  <span className="grid size-11 place-items-center rounded-2xl bg-secondary text-primary">
                    <record.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 text-xl font-semibold">{record.title}</h3>
                  <p className="mt-3 leading-7 text-muted-foreground">{record.description}</p>
                </article>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-primary/15 bg-secondary/45 px-5 py-4 sm:px-6">
              <p className="text-sm leading-7 text-foreground/80">
                <strong className="font-semibold text-foreground">A useful factual note stays with what can be observed.</strong>{" "}
                Include dates, times, people present, actions, and outcomes where relevant. Avoid speculation, diagnosis, or conclusions about another person’s intent.
              </p>
              <Link href="/guides/factual-family-records" className="mt-3 inline-flex items-center font-semibold text-primary underline underline-offset-4">
                Read the factual recordkeeping guide
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-[var(--marketing-tint)] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-16">
            <div className="lg:sticky lg:top-32">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">History that remains clear</p>
              <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                The record can evolve without losing its history.
              </h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">
                Family details sometimes need a correction or more context. Family Daybook keeps those changes easier to follow, then brings caregiving records, appointments, and factual notes together for review.
              </p>
            </div>

            <div className="relative space-y-4 before:absolute before:bottom-10 before:left-6 before:top-10 before:w-px before:bg-primary/20 sm:before:left-7">
              {historyPoints.map((point, index) => (
                <article key={point.title} className="relative pl-14 sm:pl-16">
                  <span className="absolute left-0 top-7 z-10 grid size-12 place-items-center rounded-2xl border-4 border-[var(--marketing-tint)] bg-primary text-primary-foreground shadow-sm sm:size-14">
                    <point.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="rounded-3xl border border-border/80 bg-card/85 p-6 shadow-sm backdrop-blur sm:p-7">
                    <p className="font-mono text-xs font-bold tracking-widest text-primary">0{index + 1}</p>
                    <h3 className="mt-5 text-2xl font-semibold">{point.title}</h3>
                    <p className="mt-3 leading-7 text-muted-foreground">{point.description}</p>
                  </div>
                </article>
              ))}
              <div className="flex flex-wrap gap-3 pl-14 pt-3 sm:pl-16">
                <Link href="/features/record-integrity" className={buttonVariants({ variant: "outline" })}>How record integrity works</Link>
                <Link href="/features/report-packages" className={buttonVariants({ variant: "outline" })}>Inside a report package</Link>
              </div>
            </div>
          </div>
        </section>

        <AgentAccessFeature />

        <section className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] bg-primary text-primary-foreground shadow-[0_28px_80px_rgba(23,72,60,0.18)]">
            <div className="grid gap-12 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[0.78fr_1.22fr] lg:px-14 lg:py-16">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">
                  <LockKeyhole className="size-3.5" aria-hidden="true" />
                  Private by design
                </div>
                <h2 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                  Sharing should be a deliberate choice.
                </h2>
                <p className="mt-5 max-w-xl text-lg leading-8 text-primary-foreground/75">
                  Private family recordkeeping works best when access has clear boundaries. Records stay in a private workspace, and sharing happens intentionally with people you choose.
                </p>
                <Link
                  href="/privacy"
                  className="mt-8 inline-flex min-h-11 items-center text-sm font-semibold underline decoration-white/30 underline-offset-4 hover:decoration-white"
                >
                  Read the Family Daybook privacy approach
                </Link>
                <Link
                  href="/features/reviewer-access"
                  className="mt-3 flex min-h-11 items-center text-sm font-semibold underline decoration-white/30 underline-offset-4 hover:decoration-white"
                >
                  Learn how reviewer access works
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {privacyPoints.map((point) => (
                  <article key={point.title} className="rounded-2xl border border-white/12 bg-white/[0.07] p-5">
                    <point.icon className="size-5 text-[#c9dfcf]" aria-hidden="true" />
                    <h3 className="mt-5 text-lg font-semibold">{point.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-primary-foreground/70">{point.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 rounded-[2rem] border bg-card p-6 shadow-sm sm:p-10 lg:grid-cols-[auto_1fr] lg:gap-10 lg:p-12">
            <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
              <MessageCircleOff className="size-6" aria-hidden="true" />
            </span>
            <div className="max-w-4xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">A recordkeeping tool, not a conflict tool</p>
              <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Keep the focus on clarity, context, and the day in front of you.
              </h2>
              <p className="mt-5 text-lg leading-8 text-foreground/85">
                Family Daybook is a private place to organize family records. It is not a shared co-parent messaging service, legal advice, or a substitute for professional support.
              </p>
              <p className="mt-4 leading-7 text-muted-foreground">
                It does not determine whether a record will be accepted or lead to a particular outcome. Use qualified local legal, therapeutic, mediation, parenting-coordination, or emergency support whenever the situation calls for it.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-card px-4 py-20 sm:px-6 sm:py-28 lg:px-8" aria-labelledby="co-parenting-faq-heading">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Frequently asked questions</p>
              <h2 id="co-parenting-faq-heading" className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                A few clear answers before you begin.
              </h2>
            </div>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details key={faq.question} className="group rounded-2xl border bg-card px-5 py-1 shadow-sm open:shadow-md sm:px-6">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-4 font-heading text-lg font-semibold marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                    {faq.question}
                    <span aria-hidden="true" className="text-2xl font-normal text-primary transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-3xl pb-5 leading-7 text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-5xl rounded-[2rem] border bg-[linear-gradient(135deg,var(--cta-start),var(--cta-end))] px-6 py-12 text-center shadow-sm sm:px-12 sm:py-16">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Start with an ordinary day</p>
            <h2 className="mx-auto mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              You do not need to reconstruct everything at once.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Begin with today’s routine, an appointment, or one important factual note. A useful private family timeline can grow one clear entry at a time.
            </p>
            <DaybookLink
              signedIn={signedIn}
              signedOutLabel="Create your private workspace"
              className="mt-8 h-12 px-6 text-base shadow-lg shadow-primary/15"
            />
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
