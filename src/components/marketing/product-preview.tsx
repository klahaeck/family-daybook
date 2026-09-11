import {
  CalendarDays,
  Check,
  Clock3,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

const routines = [
  { label: "Morning routine", time: "7:30 AM" },
  { label: "School drop-off", time: "8:15 AM" },
  { label: "Time together", time: "4:00 PM" },
];

export function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[36rem] lg:mx-0" aria-label="Example Family Daybook dashboard">
      <div className="absolute -inset-8 rounded-[3rem] bg-[radial-gradient(circle_at_center,var(--surface-glow),transparent_68%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-border/80 bg-card/94 p-3 shadow-[0_32px_90px_rgba(23,72,60,0.18)] backdrop-blur sm:p-4">
        <div className="rounded-[1.5rem] border bg-[var(--preview-surface)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 border-b pb-4">
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary/70">Today</p>
              <p className="mt-1 font-heading text-xl font-semibold text-foreground sm:text-2xl">Wednesday, July 16</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-900/10 bg-emerald-50 px-2.5 py-1.5 text-[0.65rem] font-semibold text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-950/50 dark:text-emerald-100">
              <LockKeyhole className="size-3" aria-hidden="true" />
              Private workspace
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Daily rhythm</p>
                <span className="text-xs font-medium text-primary">3 complete</span>
              </div>
              <div className="space-y-2.5">
                {routines.map((routine) => (
                  <div key={routine.label} className="flex items-center gap-3 rounded-xl bg-secondary/65 p-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold sm:text-sm">{routine.label}</p>
                      <p className="text-[0.65rem] text-muted-foreground">Recorded factually</p>
                    </div>
                    <span className="text-[0.65rem] font-medium text-muted-foreground">{routine.time}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex size-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                  <CalendarDays className="size-4" aria-hidden="true" />
                </div>
                <p className="mt-3 text-xs font-semibold">Upcoming</p>
                <p className="mt-1 text-sm font-semibold">Family appointment</p>
                <p className="mt-1 text-[0.68rem] text-muted-foreground">Tomorrow · 10:30 AM</p>
              </div>
              <div className="rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm">
                <div className="flex items-center gap-2 text-[0.68rem] font-semibold text-primary-foreground/75">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Record integrity
                </div>
                <p className="mt-3 font-heading text-lg font-semibold">History stays clear.</p>
                <p className="mt-1 text-[0.68rem] leading-5 text-primary-foreground/75">Corrections are added, never quietly overwritten.</p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-dashed bg-card/75 px-3 py-2.5 text-[0.68rem] font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5"><Clock3 className="size-3.5 text-primary" aria-hidden="true" /> Clear timeline</span>
            <span className="flex items-center gap-1.5"><FileCheck2 className="size-3.5 text-primary" aria-hidden="true" /> Organized reports</span>
            <span className="flex items-center gap-1.5"><LockKeyhole className="size-3.5 text-primary" aria-hidden="true" /> Authenticated access</span>
          </div>
        </div>
      </div>
    </div>
  );
}
