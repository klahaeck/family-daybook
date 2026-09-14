import { Bot, Check, KeyRound, ShieldCheck } from "lucide-react";

const assistantCapabilities = [
  "Find the right day and review the records you can access",
  "Add or update care entries and notes while a day is open",
  "Preview corrections or finalization, then wait for your confirmation",
];

const accessProtections = [
  {
    icon: KeyRound,
    title: "Permissioned access",
    description:
      "Read, write, and finalize access are granted separately through your secure sign-in.",
  },
  {
    icon: ShieldCheck,
    title: "The same safeguards",
    description:
      "Assistant actions follow the same workspace, role, subscription, validation, and history rules as the app.",
  },
];

export function AgentAccessFeature() {
  return (
    <section
      id="authorized-ai"
      className="scroll-mt-32 px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
      aria-labelledby="authorized-ai-heading"
    >
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] border bg-card shadow-sm">
        <div className="absolute -right-24 -top-28 size-80 rounded-full bg-secondary/70 blur-3xl" />
        <div className="relative grid gap-12 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16 lg:px-14 lg:py-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-primary">
              <Bot className="size-3.5" aria-hidden="true" />
              Authorized AI access with MCP
            </div>
            <h2
              id="authorized-ai-heading"
              className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
            >
              Let a trusted assistant help with the daybook.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Connect a compatible Model Context Protocol (MCP) assistant through your secure Family Daybook sign-in. It can help retrieve records, keep an open day up to date, and prepare sensitive changes without stepping outside the access you approve.
            </p>

            <div className="mt-7 flex flex-wrap gap-2" aria-label="Available MCP permission levels">
              {["Read", "Write", "Finalize"].map((permission) => (
                <span
                  key={permission}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
                >
                  <Check className="size-3.5 text-primary" aria-hidden="true" />
                  {permission}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <article className="rounded-3xl border border-border/80 bg-background/80 p-6 shadow-sm backdrop-blur sm:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                What your assistant can help with
              </p>
              <ul className="mt-5 space-y-4">
                {assistantCapabilities.map((capability) => (
                  <li key={capability} className="flex gap-3 text-sm leading-6 text-foreground/85 sm:text-base">
                    <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                      <Check className="size-3" aria-hidden="true" />
                    </span>
                    {capability}
                  </li>
                ))}
              </ul>
            </article>

            <div className="grid gap-4 sm:grid-cols-2">
              {accessProtections.map((protection) => (
                <article key={protection.title} className="rounded-2xl border border-border/80 bg-background/80 p-5 shadow-sm backdrop-blur">
                  <protection.icon className="size-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-4 font-semibold">{protection.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{protection.description}</p>
                </article>
              ))}
            </div>

            <p className="px-1 text-xs leading-5 text-muted-foreground">
              Finalizing a day and correcting a finalized record always require a preview and confirmation. Reviewer access remains read-only and limited to finalized records.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
