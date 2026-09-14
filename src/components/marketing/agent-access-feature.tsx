import Link from "next/link";
import { ArrowRight, Bot, Check, ShieldCheck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AgentAccessFeature() {
  return (
    <section
      id="authorized-ai"
      className="scroll-mt-32 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      aria-labelledby="authorized-ai-heading"
    >
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] border bg-card px-6 py-10 shadow-sm sm:px-10 sm:py-14 lg:px-14">
        <div className="absolute -right-24 -top-28 size-80 rounded-full bg-secondary/70 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-primary">
              <Bot className="size-3.5" aria-hidden="true" />
              Authorized AI access with MCP
            </div>
            <h2 id="authorized-ai-heading" className="mt-5 max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              A compatible assistant can help without bypassing your safeguards.
            </h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
              OAuth scopes separate read, write, and finalization access. Workspace checks still apply, and finalized corrections require a preview followed by confirmation.
            </p>
            <div className="mt-5 flex flex-wrap gap-4 text-sm font-medium text-foreground/80">
              <span className="inline-flex items-center gap-2"><Check className="size-4 text-primary" aria-hidden="true" />Ten focused tools</span>
              <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-primary" aria-hidden="true" />Version-safe changes</span>
            </div>
          </div>
          <Link href="/agent-access" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "bg-background")}>
            Explore agent access
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
