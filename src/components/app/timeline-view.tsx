"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarDays, CalendarRange, Clock3, Download, Filter, HeartHandshake, List, ShieldAlert } from "lucide-react";

import { TimelineAnalytics } from "@/components/app/timeline-analytics";
import { CorrectionDialog } from "@/components/forms/correction-dialog";
import { PurgeDialog } from "@/components/forms/purge-dialog";
import { RevisionHistoryDialog } from "@/components/forms/revision-history-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, formatDay, localDateInTimezone } from "@/lib/domain/dates";
import { fetchTimeline } from "@/lib/fetchers";
import type { RecordType, TimelineData } from "@/lib/domain/types";

const kindInfo = {
  care: { label: "Care", icon: HeartHandshake, className: "bg-emerald-50 text-emerald-800" },
  appointment: { label: "Appointment", icon: CalendarDays, className: "bg-blue-50 text-blue-800" },
  incident: { label: "Incident", icon: ShieldAlert, className: "bg-amber-50 text-amber-900" },
  special_day: { label: "Special day", icon: CalendarRange, className: "bg-violet-50 text-violet-900" },
};

const kindFilters = [
  { value: "all", label: "All" },
  { value: "care", label: "Care" },
  { value: "appointment", label: "Appointments" },
  { value: "incident", label: "Incidents" },
  { value: "special_day", label: "Special days" },
];

export function TimelineView({ initialData, canPurge = false }: { initialData: TimelineData; canPurge?: boolean }) {
  const { data } = useQuery({ queryKey: ["timeline"], queryFn: fetchTimeline, initialData });
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [childId, setChildId] = useState("all");
  const [caregiverId, setCaregiverId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = useMemo(
    () =>
      data.items.filter(
        (item) =>
          (kind === "all" || item.kind === kind) &&
          (childId === "all" || item.childIds.includes(childId)) &&
          (caregiverId === "all" || item.caregiverIds.includes(caregiverId)) &&
          (!from || localDateInTimezone(new Date(item.occurredAt), data.workspace.timezone) >= from) &&
          (!to || localDateInTimezone(new Date(item.occurredAt), data.workspace.timezone) <= to) &&
          (!query || `${item.title} ${item.description ?? ""}`.toLowerCase().includes(query.toLowerCase())),
      ),
    [caregiverId, childId, data.items, data.workspace.timezone, from, kind, query, to],
  );

  return (
    <Tabs defaultValue="timeline" className="gap-5">
      <TabsList aria-label="Timeline views" className="w-full sm:w-fit">
        <TabsTrigger value="timeline" className="px-3"><List /> Timeline</TabsTrigger>
        <TabsTrigger value="analytics" className="px-3"><BarChart3 /> Time charts</TabsTrigger>
      </TabsList>
      <TabsContent value="timeline" className="space-y-5">
      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]">
          <div className="relative"><Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search factual notes" className="pl-9" aria-label="Search timeline" /></div>
          <div className="flex flex-wrap gap-2">
            {kindFilters.map((filter) => <Button key={filter.value} size="sm" variant={kind === filter.value ? "default" : "outline"} onClick={() => setKind(filter.value)}>{filter.label}</Button>)}
          </div>
          <select className="h-8 rounded-lg border bg-background px-3 text-sm" value={childId} onChange={(event) => setChildId(event.target.value)} aria-label="Filter by child">
            <option value="all">All children</option>
            {data.children.map((child) => <option key={child.id} value={child.id}>{child.displayName}</option>)}
          </select>
          <select className="h-8 rounded-lg border bg-background px-3 text-sm" value={caregiverId} onChange={(event) => setCaregiverId(event.target.value)} aria-label="Filter by caregiver">
            <option value="all">All caregivers</option>
            {data.caregivers.map((caregiver) => <option key={caregiver.id} value={caregiver.id}>{caregiver.displayName}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2 lg:col-span-4">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Filter from date" />
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Filter through date" />
          </div>
        </CardContent>
      </Card>

      <div className="relative space-y-3 before:absolute before:bottom-4 before:left-5 before:top-4 before:w-px before:bg-border sm:before:left-6">
        {filtered.map((item) => {
          const info = kindInfo[item.kind];
          const Icon = info.icon;
          const childNames = item.childIds.map((id) => data.children.find((child) => child.id === id)?.displayName).filter(Boolean).join(" + ");
          const attachments = data.attachments.filter((attachment) => attachment.recordId === item.id);
          const revisions = data.revisions.filter((revision) => revision.recordId === item.id);
          return (
            <article key={`${item.kind}-${item.id}`} className="relative pl-12 sm:pl-16">
              <span className={`absolute left-0 top-5 z-10 grid size-10 place-items-center rounded-2xl border-4 border-background sm:size-12 ${info.className}`}><Icon className="size-4 sm:size-5" /></span>
              <Card className="shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{info.label}</Badge><Badge variant="secondary" className="capitalize">{item.status.replaceAll("_", " ")}</Badge>{item.lateEntry && <Badge variant="destructive">Late entry</Badge>}</div>
                      <h2 className="mt-3 font-semibold">{item.title}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {childNames}
                        {childNames && " · "}
                        {item.kind === "special_day" && item.localDate
                          ? `Planned for ${formatDay(item.localDate)}`
                          : `Occurred ${formatDateTime(item.occurredAt, data.workspace.timezone)}`}
                      </p>
                      {item.description && <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-foreground/85">{item.description}</p>}
                      {attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{attachments.map((attachment) => <a key={attachment.id} href={`/api/attachments/${attachment.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download className="size-3.5" />{attachment.originalName}</a>)}</div>}
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3" />Entered {formatDateTime(item.recordedAt, data.workspace.timezone)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <RevisionHistoryDialog revisions={revisions} timezone={data.workspace.timezone} />
                      {item.kind !== "special_day" && item.description && <CorrectionDialog recordType={(item.kind === "care" ? "care_entry" : item.kind) as RecordType} recordId={item.id} currentText={item.description} mode={item.kind === "care" && item.dailyLogStatus === "open" ? "edit" : "correct"} />}
                      {canPurge && item.kind !== "special_day" && <PurgeDialog recordType={(item.kind === "care" ? "care_entry" : item.kind) as RecordType} recordId={item.id} />}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </article>
          );
        })}
        {filtered.length === 0 && <Card className="ml-12 border-dashed sm:ml-16"><CardContent className="p-10 text-center text-sm text-muted-foreground">No records match these filters.</CardContent></Card>}
      </div>
      </TabsContent>
      <TabsContent value="analytics">
        <TimelineAnalytics data={data} />
      </TabsContent>
    </Tabs>
  );
}
