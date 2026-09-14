import type { Metadata } from "next";
import { Check, Eye, MessageSquareQuote, Scale, Timer } from "lucide-react";

import { EvidencePage } from "@/components/marketing/evidence-page";
import { userIsSignedIn } from "@/lib/auth/identity";

const title = "How to write clear, factual family records";
const description =
  "A practical guide to recording observable details, dates, people, actions, and outcomes while separating facts from assumptions or conclusions.";

export const metadata: Metadata = {
  title: "Guide to Factual Family Records",
  description,
  alternates: { canonical: "/guides/factual-family-records" },
};

const principles = [
  { icon: Eye, title: "Describe what was observed", text: "Record what you directly saw, heard, received, or did. Separate that from information someone else reported." },
  { icon: Timer, title: "Anchor the record in time", text: "Use the relevant date and time, when known, and distinguish when something occurred from when you learned about it." },
  { icon: MessageSquareQuote, title: "Attribute exact words", text: "Use quotation marks only for words you remember or preserved exactly. Otherwise summarize and identify it as a summary." },
  { icon: Scale, title: "Avoid conclusions about intent", text: "Describe actions and outcomes without diagnosing, assigning motives, or presenting an interpretation as a fact." },
];

export default async function FactualFamilyRecordsPage() {
  const signedIn = await userIsSignedIn();
  return (
    <EvidencePage
      signedIn={signedIn}
      path="/guides/factual-family-records"
      eyebrow="Recordkeeping guide"
      title={title}
      description={description}
      relatedLinks={[
        { href: "/features/record-integrity", label: "How corrections preserve history" },
        { href: "/co-parenting-recordkeeping", label: "Co-parenting recordkeeping" },
      ]}
    >
      <section aria-labelledby="principles-heading">
        <h2 id="principles-heading" className="text-3xl font-semibold tracking-tight">Four useful habits</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {principles.map((principle) => (
            <article key={principle.title} className="rounded-2xl border bg-card p-6 shadow-sm">
              <principle.icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-xl font-semibold">{principle.title}</h3>
              <p className="mt-2 leading-7 text-muted-foreground">{principle.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="include-heading">
        <h2 id="include-heading" className="text-3xl font-semibold tracking-tight">Details to include when they are relevant</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {["Date, time, and place of the event", "People present or the source of reported information", "Specific actions, observable conditions, and exact words", "Immediate response, follow-up, and known outcome", "Supporting attachment and how it relates to the entry", "Any uncertainty or detail you could not confirm"].map((item) => <li key={item} className="flex gap-3 rounded-xl border bg-card p-4 text-sm leading-6 text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{item}</li>)}
        </ul>
      </section>

      <section className="rounded-3xl border bg-[var(--marketing-tint)] p-6 sm:p-8" aria-labelledby="example-heading">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Synthetic example</p>
        <h2 id="example-heading" className="mt-3 text-2xl font-semibold">Keep observation separate from interpretation.</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="font-semibold">Less useful</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">“The handoff was intentionally made difficult again.”</p>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-card p-5">
            <h3 className="font-semibold">More factual</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">“At 5:20 p.m., I arrived at the agreed handoff location. At 5:35 p.m., I received a message saying arrival would be at 5:50 p.m. The handoff occurred at 5:53 p.m.”</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-primary/20 bg-secondary/45 p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Use this guide as a writing aid.</h2>
        <p className="mt-4 leading-7 text-muted-foreground">Family Daybook does not verify user-entered facts and this guide is not legal, medical, mental-health, safety, or emergency advice. Qualified professionals can help with decisions that require professional judgment.</p>
      </section>
    </EvidencePage>
  );
}
