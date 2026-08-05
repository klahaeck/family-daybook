"use client";

import { useMemo, useState } from "react";
import {
  Baby,
  BarChart3,
  CalendarDays,
  ListChecks,
  ListFilter,
  UsersRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { TimelineData } from "@/lib/domain/types";
import {
  getCareRecordItems,
  summarizeCareRecords,
} from "@/lib/timeline-analytics";

const segmentColors = [
  "bg-emerald-700",
  "bg-blue-600",
  "bg-amber-500",
  "bg-violet-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-lime-600",
  "bg-orange-600",
];

function formatRecordCount(count: number): string {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

function formatRecordDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function ToggleGroup({
  label,
  options,
  selected,
  onSelectedChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onSelectedChange: (values: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  return (
    <fieldset className="min-w-0 rounded-xl border bg-background/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <legend className="px-1 text-sm font-medium">{label}</legend>
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onSelectedChange(options.map((option) => option.value))}
          >
            All
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onSelectedChange([])}
          >
            Clear
          </Button>
        </div>
      </div>
      <div className="mt-3 max-h-44 space-y-2 overflow-y-auto px-1 pb-1">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2.5 text-sm">
            <Checkbox
              checked={selectedSet.has(option.value)}
              onCheckedChange={(checked) =>
                onSelectedChange(
                  checked
                    ? [...selected, option.value]
                    : selected.filter((value) => value !== option.value),
                )
              }
            />
            <span className="truncate">{option.label}</span>
          </label>
        ))}
        {options.length === 0 && (
          <p className="text-xs text-muted-foreground">No options recorded yet.</p>
        )}
      </div>
    </fieldset>
  );
}

export function TimelineAnalytics({ data }: { data: TimelineData }) {
  const recordItemOptions = useMemo(
    () => getCareRecordItems(data.items),
    [data.items],
  );
  const [hiddenRecordItems, setHiddenRecordItems] = useState<string[]>([]);
  const [hiddenChildIds, setHiddenChildIds] = useState<string[]>([]);
  const [hiddenCaregiverIds, setHiddenCaregiverIds] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const recordItems = recordItemOptions.filter(
    (item) => !hiddenRecordItems.includes(item),
  );
  const childIds = data.children
    .map((child) => child.id)
    .filter((id) => !hiddenChildIds.includes(id));
  const caregiverIds = data.caregivers
    .map((caregiver) => caregiver.id)
    .filter((id) => !hiddenCaregiverIds.includes(id));
  const summary = useMemo(
    () =>
      summarizeCareRecords(data, {
        recordItems,
        childIds,
        caregiverIds,
        from,
        to,
      }),
    [caregiverIds, childIds, data, from, recordItems, to],
  );
  const maxCaregiverRecords = Math.max(
    1,
    ...summary.caregivers.map((caregiver) => caregiver.totalRecords),
  );
  const maxRecordItemRecords = Math.max(
    1,
    ...summary.recordItems.map((item) => item.count),
  );
  const hasRecords = summary.recordCount > 0;
  const childNames = useMemo(
    () => new Map(data.children.map((child) => [child.id, child.displayName])),
    [data.children],
  );
  const caregiverNames = useMemo(
    () =>
      new Map(
        data.caregivers.map((caregiver) => [
          caregiver.id,
          caregiver.displayName,
        ]),
      ),
    [data.caregivers],
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>
            <h2 className="flex items-center gap-2">
              <ListFilter className="size-4 text-primary" /> Configure charts
            </h2>
          </CardTitle>
          <CardDescription>
            Toggle the completed or partial caregiving records included in the
            charts and record list. Date filters use {data.workspace.timezone}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              <span>From</span>
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Through</span>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <ToggleGroup
              label="Record items"
              options={recordItemOptions.map((item) => ({
                value: item,
                label: item,
              }))}
              selected={recordItems}
              onSelectedChange={(selected) =>
                setHiddenRecordItems(
                  recordItemOptions.filter((item) => !selected.includes(item)),
                )
              }
            />
            <ToggleGroup
              label="Children"
              options={data.children.map((child) => ({
                value: child.id,
                label: child.displayName,
              }))}
              selected={childIds}
              onSelectedChange={(selected) =>
                setHiddenChildIds(
                  data.children
                    .map((child) => child.id)
                    .filter((id) => !selected.includes(id)),
                )
              }
            />
            <ToggleGroup
              label="Caregivers"
              options={data.caregivers.map((caregiver) => ({
                value: caregiver.id,
                label: caregiver.displayName,
              }))}
              selected={caregiverIds}
              onSelectedChange={(selected) =>
                setHiddenCaregiverIds(
                  data.caregivers
                    .map((caregiver) => caregiver.id)
                    .filter((id) => !selected.includes(id)),
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Included records
            </p>
            <p className="mt-2 font-heading text-2xl font-semibold">
              {summary.recordCount}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Record items represented
            </p>
            <p className="mt-2 font-heading text-2xl font-semibold">
              {summary.representedRecordItemCount}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Caregivers represented
            </p>
            <p className="mt-2 font-heading text-2xl font-semibold">
              {summary.representedCaregiverCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {hasRecords ? (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="flex items-center gap-2">
                    <UsersRound className="size-4 text-primary" /> Records by
                    caregiver
                  </h2>
                </CardTitle>
                <CardDescription>
                  Each bar counts included records for a caregiver, split by
                  record item.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {recordItems.map((item, index) => (
                    <span
                      key={item}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <span
                        className={`size-2.5 rounded-sm ${segmentColors[index % segmentColors.length]}`}
                      />
                      {item}
                    </span>
                  ))}
                </div>
                <div className="space-y-5">
                  {summary.caregivers.map((caregiver) => (
                    <div key={caregiver.id}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{caregiver.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatRecordCount(caregiver.totalRecords)}
                        </span>
                      </div>
                      <div
                        className="flex h-7 overflow-hidden rounded-md bg-muted"
                        role="img"
                        aria-label={`${caregiver.label}: ${formatRecordCount(caregiver.totalRecords)}`}
                      >
                        {caregiver.recordItems.map((item, index) =>
                          item.count > 0 ? (
                            <span
                              key={item.label}
                              className={
                                segmentColors[index % segmentColors.length]
                              }
                              style={{
                                width: `${(item.count / maxCaregiverRecords) * 100}%`,
                              }}
                              title={`${item.label}: ${formatRecordCount(item.count)}`}
                            />
                          ) : null,
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="flex items-center gap-2">
                    <BarChart3 className="size-4 text-primary" /> Records by item
                  </h2>
                </CardTitle>
                <CardDescription>
                  Record counts across the selected caregivers and children.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {summary.recordItems.map((item) => (
                  <div key={item.label}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{item.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatRecordCount(item.count)}
                      </span>
                    </div>
                    <div
                      className="h-7 overflow-hidden rounded-md bg-muted"
                      role="img"
                      aria-label={`${item.label}: ${formatRecordCount(item.count)}`}
                    >
                      <div
                        className="h-full rounded-md bg-primary"
                        style={{
                          width: `${(item.count / maxRecordItemRecords) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="flex items-center gap-2">
                  <ListChecks className="size-4 text-primary" /> Included records
                </h2>
              </CardTitle>
              <CardDescription>
                The records represented above, with their children and caregivers.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {summary.records.map((record) => {
                const recordChildren = record.childIds
                  .map((id) => childNames.get(id))
                  .filter(Boolean)
                  .join(" + ");
                const recordCaregivers = record.caregiverIds
                  .map((id) => caregiverNames.get(id))
                  .filter(Boolean)
                  .join(" + ");
                return (
                  <article key={record.id} className="rounded-xl border bg-background/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium">{record.title}</h3>
                      <Badge variant="secondary" className="capitalize">
                        {record.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="size-3.5" />
                      {formatRecordDate(record.occurredAt, data.workspace.timezone)}
                    </p>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <p className="flex items-start gap-2">
                        <Baby className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span>
                          <span className="text-xs text-muted-foreground">Children</span>
                          <span className="block">{recordChildren || "Not listed"}</span>
                        </span>
                      </p>
                      <p className="flex items-start gap-2">
                        <UsersRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span>
                          <span className="text-xs text-muted-foreground">Caregivers</span>
                          <span className="block">{recordCaregivers || "Not listed"}</span>
                        </span>
                      </p>
                    </div>
                  </article>
                );
              })}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <ListChecks className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No care records match</p>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
              Choose at least one record item, child, and caregiver, or widen the
              date range.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="rounded-xl bg-muted/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
        These charts count completed or partial care records; they do not use or
        display recorded durations. Planned special days are excluded. A record
        involving multiple selected children is counted once, while a record with
        multiple caregivers appears once for each caregiver in the caregiver chart.
      </p>
    </div>
  );
}
