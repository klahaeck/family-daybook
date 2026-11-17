import { cn } from "@/lib/utils";

function Placeholder({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} />;
}

export function PageSkeleton({
  label = "page",
  variant = "list",
}: {
  label?: string;
  variant?: "dashboard" | "list" | "settings";
}) {
  return (
    <section aria-busy="true" aria-label={`Loading ${label}`}>
      <p role="status" className="sr-only">Loading {label}...</p>
      <div aria-hidden="true" className="space-y-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full max-w-2xl space-y-3">
            <Placeholder className="h-3 w-28" />
            <Placeholder className="h-10 w-3/4 max-w-80" />
            <Placeholder className="h-5 w-full" />
          </div>
          <Placeholder className="h-10 w-36 shrink-0" />
        </div>
        {variant === "dashboard" && (
          <>
            <Placeholder className="h-20 w-full rounded-2xl" />
            <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
              <Placeholder className="h-52 rounded-2xl" />
              <Placeholder className="h-52 rounded-2xl" />
            </div>
          </>
        )}
        <div className={cn("space-y-4", variant === "settings" && "max-w-4xl")}>
          {Array.from({ length: variant === "settings" ? 3 : 4 }, (_, index) => (
            <div key={index} className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <Placeholder className="size-10 shrink-0 rounded-xl" />
                <div className="w-full space-y-2">
                  <Placeholder className="h-4 w-2/5" />
                  <Placeholder className="h-3 w-3/5" />
                </div>
              </div>
              {variant === "settings" && <Placeholder className="h-10 w-full" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--surface-glow),transparent_36rem)]">
      <div aria-hidden="true" className="fixed inset-y-0 left-0 hidden w-64 space-y-5 border-r bg-background/92 p-6 lg:block">
        <Placeholder className="mb-10 h-9 w-full" />
        {Array.from({ length: 7 }, (_, index) => <Placeholder key={index} className="h-11 w-full rounded-xl" />)}
      </div>
      <div className="lg:pl-64">
        <div aria-hidden="true" className="h-16 border-b lg:hidden" />
        <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-9">
          <PageSkeleton />
        </main>
      </div>
    </div>
  );
}
