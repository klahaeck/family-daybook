import type { Metadata } from "next";
import { Check, Clock3, FileLock2, History, Link2 } from "lucide-react";

import { EvidencePage } from "@/components/marketing/evidence-page";
import { userIsSignedIn } from "@/lib/auth/identity";

const title = "Record integrity without hidden rewrites";
const description =
  "Family Daybook uses server timestamps, day finalization, append-only corrections, and linked hashes to preserve record context and make later changes easier to detect.";

export const metadata: Metadata = {
  title: "Record Integrity",
  description,
  alternates: { canonical: "/features/record-integrity" },
};

const controls = [
  {
    icon: Clock3,
    title: "Server-controlled timestamps",
    text: "The service records creation, update, correction, and finalization times on the server instead of trusting a browser-supplied audit time.",
  },
  {
    icon: FileLock2,
    title: "Day finalization",
    text: "Finalizing a day locks direct edits to that day’s care records. The preview summarizes the exact day version before confirmation.",
  },
  {
    icon: History,
    title: "Append-only corrections",
    text: "A finalized record is corrected by appending a reasoned revision. The previous revision remains in history rather than being silently replaced.",
  },
  {
    icon: Link2,
    title: "Linked hashes",
    text: "Each stored revision hash covers canonical record content and its predecessor, creating a chain that helps detect later alteration.",
  },
];

export default async function RecordIntegrityPage() {
  const signedIn = await userIsSignedIn();
  return (
    <EvidencePage
      signedIn={signedIn}
      path="/features/record-integrity"
      eyebrow="Integrity controls"
      title={title}
      description={description}
      relatedLinks={[
        { href: "/features/report-packages", label: "Inside report packages" },
        { href: "/guides/factual-family-records", label: "Write factual records" },
      ]}
    >
      <section aria-labelledby="controls-heading">
        <h2 id="controls-heading" className="text-3xl font-semibold tracking-tight">Four layers preserve context.</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {controls.map((control) => (
            <div key={control.title} className="rounded-2xl border bg-card p-6 shadow-sm">
              <control.icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-xl font-semibold">{control.title}</h3>
              <p className="mt-2 leading-7 text-muted-foreground">{control.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="correction-heading">
        <h2 id="correction-heading" className="text-3xl font-semibold tracking-tight">What happens when a finalized record needs a correction?</h2>
        <ol className="mt-6 space-y-4">
          {[
            "The current record and version are fetched.",
            "The proposed correction, reason, and changed fields are previewed.",
            "A short-lived handle binds confirmation to that exact preview.",
            "Confirmation appends a new revision only if the record is unchanged and the handle remains valid.",
          ].map((step, index) => (
            <li key={step} className="flex gap-4 rounded-2xl border bg-card p-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-primary">{index + 1}</span>
              <p className="pt-1 leading-7 text-muted-foreground">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-3xl border border-primary/20 bg-secondary/45 p-6 sm:p-8" aria-labelledby="limits-heading">
        <h2 id="limits-heading" className="text-2xl font-semibold">What these controls do not claim</h2>
        <ul className="mt-5 space-y-3 text-sm leading-6 text-foreground/80">
          {[
            "They do not make the service or exported files tamper-proof.",
            "They do not prove that user-entered content is true, complete, or independently verified.",
            "They do not guarantee that a record will be accepted by another person, institution, or proceeding.",
          ].map((limit) => <li key={limit} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{limit}</li>)}
        </ul>
      </section>
    </EvidencePage>
  );
}
