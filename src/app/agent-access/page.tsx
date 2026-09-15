import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

import { JsonLd } from "@/components/metadata/json-ld";
import { CopyEndpointButton } from "@/components/marketing/copy-endpoint-button";
import { DaybookLink } from "@/components/marketing/daybook-link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { buttonVariants } from "@/components/ui/button";
import { userIsSignedIn } from "@/lib/auth/identity";
import {
  DAYBOOK_SCOPES,
  DAYBOOK_SCOPE_DESCRIPTIONS,
  DAYBOOK_TOOL_CATALOG,
} from "@/lib/mcp/catalog";
import { getSiteUrl } from "@/lib/metadata/site-url";
import { pageStructuredData } from "@/lib/metadata/structured-data";
import { cn } from "@/lib/utils";

const title = "Authorized AI Agent Access with MCP";
const description =
  "Connect a compatible MCP assistant to Family Daybook with OAuth permissions, workspace boundaries, fresh versions, and confirmation for sensitive changes.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/agent-access" },
  openGraph: { title, description, url: "/agent-access" },
};

const groups = ["Context and records", "Open-day updates", "Protected final changes"] as const;

const safeguards = [
  {
    icon: KeyRound,
    title: "Separate permissions",
    description: "Read, write, and finalization scopes are granted separately during OAuth authorization.",
  },
  {
    icon: RefreshCw,
    title: "Fresh versions",
    description: "Updates carry current record or day versions so stale requests fail instead of overwriting newer work.",
  },
  {
    icon: ShieldCheck,
    title: "Preview, then confirm",
    description: "Corrections and finalization are previewed first. Confirmation applies only to the exact unchanged preview.",
  },
  {
    icon: LockKeyhole,
    title: "Workspace boundaries",
    description: "Every operation repeats the same membership, role, billing, and workspace checks used by the private app.",
  },
];

export default async function AgentAccessPage() {
  const signedIn = await userIsSignedIn();
  const siteUrl = getSiteUrl();
  const endpoint = new URL("/mcp", siteUrl).toString();
  const structuredData = pageStructuredData({
    siteUrl,
    path: "/agent-access",
    name: title,
    description,
    breadcrumbs: [
      { name: "Family Daybook", path: "/" },
      { name: "Agent access", path: "/agent-access" },
    ],
  });

  return (
    <MarketingShell signedIn={signedIn}>
      <JsonLd data={structuredData} />
      <main>
        <header className="relative isolate overflow-hidden border-b">
          <div className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,var(--hero-start)_0%,var(--hero-middle)_62%,var(--background)_100%)]" />
          <div className="absolute -right-40 top-0 -z-10 size-[32rem] rounded-full bg-[var(--hero-glow)] blur-3xl" />
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/75 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
              <Bot className="size-3.5" aria-hidden="true" />
              Model Context Protocol
            </div>
            <h1 className="mt-6 max-w-4xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              Let an authorized assistant help with the daybook.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Family Daybook exposes a focused set of MCP tools through secure OAuth sign-in. An assistant receives only the access you authorize and remains subject to the app’s workspace, role, validation, and history rules.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <DaybookLink signedIn={signedIn} className="h-11 px-5" />
              {!signedIn && (
                <Link href="/sign-in" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-11")}>
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>

        <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8" aria-labelledby="connect-heading">
          <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Connection</p>
              <h2 id="connect-heading" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">One canonical endpoint</h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                Add this Streamable HTTP endpoint to a compatible MCP client. The client discovers OAuth requirements and asks you to authorize the requested scopes.
              </p>
            </div>
            <div className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold">Streamable HTTP MCP endpoint</p>
              <code className="mt-3 block overflow-x-auto rounded-xl bg-muted px-4 py-3 font-mono text-sm">{endpoint}</code>
              <div className="mt-5"><CopyEndpointButton endpoint={endpoint} /></div>
              <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                <li>Add the endpoint in your MCP client.</li>
                <li>Sign in to Family Daybook through the OAuth window.</li>
                <li>Review and authorize only the scopes the assistant needs.</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="border-b px-4 py-12 sm:px-6 lg:px-8" aria-labelledby="routine-example-heading">
          <div className="mx-auto max-w-5xl rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Routine example</p>
            <h2 id="routine-example-heading" className="mt-3 text-2xl font-semibold">“Mark bedtime story done.”</h2>
            <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
              The assistant can resolve the routine by name, then ask only for required details such as the date, caregiver, and actual local time. It creates nothing until those answers are complete.
            </p>
          </div>
        </section>

        <section className="bg-[var(--marketing-tint)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8" aria-labelledby="permissions-heading">
          <div className="mx-auto max-w-5xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">OAuth permissions</p>
            <h2 id="permissions-heading" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Access is explicit and scoped.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {Object.values(DAYBOOK_SCOPES).map((scope) => (
                <article key={scope} className="rounded-2xl border bg-card p-5 shadow-sm">
                  <code className="text-sm font-semibold text-primary">{scope}</code>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{DAYBOOK_SCOPE_DESCRIPTIONS[scope]}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8" aria-labelledby="tools-heading">
          <div className="mx-auto max-w-5xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Tool catalog</p>
            <h2 id="tools-heading" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Eleven tools with bounded responsibilities.</h2>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">Tool names and descriptions below are generated from the same catalog used by the live MCP server.</p>
            <div className="mt-10 space-y-10">
              {groups.map((group) => (
                <section key={group} aria-labelledby={`group-${group.replaceAll(" ", "-").toLowerCase()}`}>
                  <h3 id={`group-${group.replaceAll(" ", "-").toLowerCase()}`} className="text-2xl font-semibold">{group}</h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {DAYBOOK_TOOL_CATALOG.filter((tool) => tool.group === group).map((tool) => (
                      <article key={tool.name} className="rounded-2xl border bg-card p-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <code className="text-sm font-semibold text-primary">{tool.name}</code>
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">{tool.scope}</span>
                        </div>
                        <h4 className="mt-4 text-lg font-semibold">{tool.title}</h4>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{tool.description}</p>
                        {tool.requiresConfirmation && (
                          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-foreground"><Check className="size-3.5 text-primary" aria-hidden="true" />Requires a valid preview confirmation</p>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--marketing-tint)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8" aria-labelledby="safeguards-heading">
          <div className="mx-auto max-w-5xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Safeguards</p>
            <h2 id="safeguards-heading" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Sensitive actions stay deliberate.</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {safeguards.map((item) => (
                <article key={item.title} className="rounded-2xl border bg-card p-6 shadow-sm">
                  <item.icon className="size-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-2 leading-7 text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
            <div className="mt-8 rounded-2xl border bg-card p-6">
              <h3 className="flex items-center gap-2 text-xl font-semibold"><UserCheck className="size-5 text-primary" aria-hidden="true" />Owner and reviewer access</h3>
              <p className="mt-3 leading-7 text-muted-foreground">Owners can use authorized read, write, and finalization tools. Reviewers remain read-only and can see only finalized records available to their membership. Billing eligibility follows the workspace owner.</p>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8" aria-labelledby="limits-heading">
          <div className="mx-auto max-w-5xl">
            <h2 id="limits-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">Important limits</h2>
            <ul className="mt-6 grid gap-3 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
              {[
                "An assistant cannot cross workspace boundaries or expand the signed-in member’s role.",
                "Identifiers must come from authorized reads; tools are instructed never to guess them.",
                "Stale record and day versions fail and must be fetched again.",
                "A preview does not change data, and confirmation cannot be inferred or automatic.",
                "Family Daybook does not independently verify user-entered facts or attachments.",
                "The MCP connection is a recordkeeping aid, not legal, medical, or emergency advice.",
              ].map((limit) => <li key={limit} className="flex gap-3 rounded-xl border bg-card p-4"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{limit}</li>)}
            </ul>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
          <div className="mx-auto max-w-5xl rounded-3xl border bg-card p-7 shadow-sm sm:p-10">
            <h2 className="text-2xl font-semibold">Explore the underlying safeguards</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Record integrity", "/features/record-integrity"],
                ["Reviewer access", "/features/reviewer-access"],
                ["Report packages", "/features/report-packages"],
                ["Factual recordkeeping guide", "/guides/factual-family-records"],
              ].map(([label, href]) => (
                <Link key={href} href={href} className="flex items-center justify-between rounded-xl border p-4 font-semibold hover:bg-muted/50">
                  {label}<ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
