import type { Metadata } from "next";
import { Check, Download, Eye, UserRoundCheck, UserRoundX } from "lucide-react";

import { EvidencePage } from "@/components/marketing/evidence-page";
import { userIsSignedIn } from "@/lib/auth/identity";

const title = "Read-only reviewer access with clear boundaries";
const description =
  "Workspace owners can invite a reviewer to see finalized family records and reports without granting record-editing or workspace-management access.";

export const metadata: Metadata = {
  title: "Reviewer Access",
  description,
  alternates: { canonical: "/features/reviewer-access" },
};

const lifecycle = [
  { icon: UserRoundCheck, title: "Owner invitation", text: "The workspace owner chooses the reviewer and sends an invitation to the intended account." },
  { icon: Eye, title: "Finalized visibility", text: "The reviewer can read finalized records and related available attachments, not open-day drafts." },
  { icon: Download, title: "Report access", text: "Generated reports available to the workspace can be reviewed and downloaded through authenticated routes." },
  { icon: UserRoundX, title: "Revocation", text: "The owner can revoke future workspace access when review is complete or no longer appropriate." },
];

export default async function ReviewerAccessPage() {
  const signedIn = await userIsSignedIn();
  return (
    <EvidencePage
      signedIn={signedIn}
      path="/features/reviewer-access"
      eyebrow="Intentional sharing"
      title={title}
      description={description}
      relatedLinks={[
        { href: "/features/report-packages", label: "Inside report packages" },
        { href: "/agent-access", label: "Authorized agent access" },
      ]}
    >
      <section aria-labelledby="lifecycle-heading">
        <h2 id="lifecycle-heading" className="text-3xl font-semibold tracking-tight">From invitation to revocation</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {lifecycle.map((item) => (
            <article key={item.title} className="rounded-2xl border bg-card p-6 shadow-sm">
              <item.icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
              <p className="mt-2 leading-7 text-muted-foreground">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-2" aria-label="Reviewer permissions">
        <div className="rounded-3xl border border-primary/20 bg-secondary/45 p-6">
          <h2 className="text-2xl font-semibold">A reviewer can</h2>
          <ul className="mt-5 space-y-3 text-sm leading-6">
            {["Read finalized records visible to the workspace membership.", "Review available revision history and authenticated attachments.", "Open and download generated report packages."].map((item) => <li key={item} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{item}</li>)}
          </ul>
        </div>
        <div className="rounded-3xl border bg-card p-6">
          <h2 className="text-2xl font-semibold">A reviewer cannot</h2>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
            {["Create, edit, correct, finalize, or delete family records.", "View open-day records that have not been finalized.", "Change workspace settings, invitations, or the owner’s plan."].map((item) => <li key={item} className="flex gap-3"><span aria-hidden="true" className="text-primary">—</span>{item}</li>)}
          </ul>
        </div>
      </section>

      <section aria-labelledby="billing-heading">
        <h2 id="billing-heading" className="text-3xl font-semibold tracking-tight">Billing follows the workspace owner.</h2>
        <p className="mt-4 leading-7 text-muted-foreground">An invited reviewer does not need a separate paid plan for the owner’s workspace. Access depends on the owner’s eligible plan and the reviewer’s active membership.</p>
      </section>

      <section className="rounded-3xl border border-primary/20 bg-secondary/45 p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Revocation has a practical limit.</h2>
        <p className="mt-4 leading-7 text-muted-foreground">Revoking membership stops future access through Family Daybook. It cannot retract files or information the reviewer already downloaded or copied, so owners should invite reviewers deliberately.</p>
      </section>
    </EvidencePage>
  );
}
