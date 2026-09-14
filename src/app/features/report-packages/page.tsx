import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Check, FileCheck2, FileJson2, Files } from "lucide-react";

import { EvidencePage } from "@/components/marketing/evidence-page";
import { buttonVariants } from "@/components/ui/button";
import { userIsSignedIn } from "@/lib/auth/identity";

const title = "Organized report packages with a stable snapshot";
const description =
  "A Family Daybook report package brings selected records, revision history, available originals, a manifest, and checksums into one reviewable export.";

export const metadata: Metadata = {
  title: "Report Packages",
  description,
  alternates: { canonical: "/features/report-packages" },
};

const contents = [
  { icon: FileCheck2, title: "Readable PDF", text: "A formatted review copy of the records selected when the report was requested." },
  { icon: Files, title: "Available originals", text: "Private source attachments included with the entries they support when available." },
  { icon: FileJson2, title: "Manifest", text: "A structured inventory of the snapshot, filters, records, revisions, attachments, and their identifiers." },
  { icon: Archive, title: "Checksums", text: "SHA-256 values for the PDF, manifest, and included attachments so copied files can be compared." },
];

export default async function ReportPackagesPage() {
  const signedIn = await userIsSignedIn();
  return (
    <EvidencePage
      signedIn={signedIn}
      path="/features/report-packages"
      eyebrow="Portable review"
      title={title}
      description={description}
      relatedLinks={[
        { href: "/features/record-integrity", label: "How record integrity works" },
        { href: "/features/reviewer-access", label: "Reviewer access" },
      ]}
    >
      <section aria-labelledby="package-heading">
        <h2 id="package-heading" className="text-3xl font-semibold tracking-tight">What is inside the package?</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {contents.map((item) => (
            <article key={item.title} className="rounded-2xl border bg-card p-6 shadow-sm">
              <item.icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
              <p className="mt-2 leading-7 text-muted-foreground">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border bg-[var(--marketing-tint)] p-6 sm:p-8" aria-labelledby="snapshot-heading">
        <h2 id="snapshot-heading" className="text-2xl font-semibold">A report is a snapshot, not a live view.</h2>
        <p className="mt-4 leading-7 text-muted-foreground">The snapshot fixes the selected date range, child filters, included record categories, and revision IDs at request time. Later corrections can appear in a newer report, but they do not rewrite an already generated package.</p>
        <Link href="/samples/report-package-manifest.json" download className={`${buttonVariants({ variant: "outline" })} mt-6 bg-card`}>
          Download synthetic manifest example
        </Link>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">The example contains invented identifiers and checksum values. It contains no family or account data.</p>
      </section>

      <section aria-labelledby="review-heading">
        <h2 id="review-heading" className="text-3xl font-semibold tracking-tight">Review checks that remain visible</h2>
        <ul className="mt-6 space-y-3 text-sm leading-6 text-muted-foreground">
          {[
            "Confirm that the manifest filters match the intended review period.",
            "Compare record and revision identifiers with the readable PDF.",
            "Use the checksum file to detect accidental or later changes to copied package files.",
            "Treat planned arrangements as context only; they do not establish that care occurred.",
          ].map((item) => <li key={item} className="flex gap-3 rounded-xl border bg-card p-4"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{item}</li>)}
        </ul>
      </section>

      <section className="rounded-3xl border border-primary/20 bg-secondary/45 p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Important limits</h2>
        <p className="mt-4 leading-7 text-muted-foreground">A package organizes user-entered material but does not independently authenticate an attachment, verify an event, guarantee completeness, or determine how another party will evaluate the records. Downloaded copies are outside Family Daybook’s revocation controls.</p>
      </section>
    </EvidencePage>
  );
}
