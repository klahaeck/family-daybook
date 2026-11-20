"use client";

import type { ParentingSchedule } from "@/lib/domain/types";
import { shiftLocalDate } from "@/lib/domain/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ParentingScheduleEditor({ value, onChange, childOptions, today }: {
  value?: ParentingSchedule;
  onChange: (value: ParentingSchedule) => void;
  childOptions: Array<{ id: string; displayName: string }>;
  today: string;
}) {
  const draft: ParentingSchedule = value ?? { effectiveFrom: today, anchorDate: today, enabled: false, children: childOptions.map((child) => ({ childId: child.id, days: Array(14).fill("mine") })) };
  const change = (patch: Partial<ParentingSchedule>) => onChange({ ...draft, ...patch });
  const weeks = (draft.children[0]?.days.length ?? 14) / 7;
  return <section className="space-y-5 rounded-2xl border p-5" aria-labelledby="parenting-schedule-heading">
    <div><h3 id="parenting-schedule-heading" className="font-semibold">Parenting schedule</h3><p className="mt-1 text-sm text-muted-foreground">Plan whole days without inviting the other parent. Actual care is recorded separately.</p></div>
    <Button type="button" variant={draft.enabled ? "default" : "outline"} onClick={() => change({ enabled: !draft.enabled })}>{draft.enabled ? "Schedule enabled" : "Enable parenting schedule"}</Button>
    {draft.enabled && <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="schedule-effective">Apply changes from</Label><Input id="schedule-effective" type="date" min={today} value={draft.effectiveFrom} onChange={(e) => change({ effectiveFrom: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="schedule-anchor">First day of cycle</Label><Input id="schedule-anchor" type="date" value={draft.anchorDate} onChange={(e) => change({ anchorDate: e.target.value })} /></div>
      </div>
      <div className="space-y-2"><Label>Cycle length</Label><div className="flex flex-wrap gap-2">{[1, 2, 3, 4].map((count) => <Button key={count} type="button" variant={weeks === count ? "default" : "outline"} onClick={() => change({ children: childOptions.map((child) => { const days = draft.children.find((item) => item.childId === child.id)?.days ?? ["mine" as const]; return { childId: child.id, days: Array.from({ length: count * 7 }, (_, i) => days[i % days.length]) }; }) })}>{count} {count === 1 ? "week" : "weeks"}</Button>)}</div></div>
      <p className="text-sm text-muted-foreground">Tap a day to switch between you and the other parent. On your days, you can still record their help. Off-day routines are optional and track your contributions only.</p>
      {childOptions.map((child, childIndex) => {
        const days = draft.children.find((item) => item.childId === child.id)?.days ?? Array<"mine" | "other">(weeks * 7).fill("mine");
        const update = (next: Array<"mine" | "other">) => change({ children: childOptions.map((item) => ({ childId: item.id, days: item.id === child.id ? next : draft.children.find((entry) => entry.childId === item.id)?.days ?? Array<"mine" | "other">(weeks * 7).fill("mine") })) });
        return <div key={child.id} className="space-y-3 border-t pt-4"><h4 className="font-medium">{child.displayName || `Child ${childIndex + 1}`}</h4>
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => update(Array.from({ length: 14 }, (_, i) => i < 7 ? "mine" : "other"))}>Alternating weeks</Button><Button type="button" size="sm" variant="outline" onClick={() => update(["mine", "mine", "other", "other", "mine", "mine", "mine", "other", "other", "mine", "mine", "other", "other", "other"])}>2-2-3</Button>{childOptions.length > 1 && <Button type="button" size="sm" variant="outline" onClick={() => change({ children: childOptions.map((item) => ({ childId: item.id, days: [...days] })) })}>Apply to all children</Button>}</div>
          {Array.from({ length: days.length / 7 }, (_, week) => <div key={week} className="space-y-2"><p className="text-xs font-medium text-muted-foreground">Week {week + 1}</p><div className="grid grid-cols-7 gap-1">{days.slice(week * 7, week * 7 + 7).map((day, index) => {
            const offset = week * 7 + index;
            let label = `Day ${offset + 1}`;
            try { label = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(`${shiftLocalDate(draft.anchorDate, offset)}T12:00:00Z`)); } catch { /* Keep editor usable while a date is being entered. */ }
            return <button key={offset} type="button" aria-label={`${child.displayName} week ${week + 1} ${label}: ${day === "mine" ? "My day" : "Other parent"}`} aria-pressed={day === "mine"} className={`min-h-16 rounded-xl border px-1 py-2 text-center text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${day === "mine" ? "border-primary bg-primary/10 text-foreground" : "bg-muted text-muted-foreground"}`} onClick={() => update(days.map((item, i) => i === offset ? item === "mine" ? "other" : "mine" : item))}><span className="block font-medium">{label}</span><span className="mt-1 block">{day === "mine" ? "Me" : "Other"}</span></button>;
          })}</div></div>)}
        </div>;
      })}
    </>}
  </section>;
}
