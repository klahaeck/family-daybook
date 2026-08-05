"use client";

import { useMemo, useState } from "react";
import { BarChart3, Clock3, ListFilter, UsersRound } from "lucide-react";

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
  summarizeCareTime,
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

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
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
      summarizeCareTime(data, {
        recordItems,
        childIds,
        caregiverIds,
        from,
        to,
      }),
    [caregiverIds, childIds, data, from, recordItems, to],
  );
  const maxCaregiverMinutes = Math.max(
    1,
    ...summary.caregivers.map((caregiver) => caregiver.totalMinutes),
  );
  const maxRecordItemMinutes = Math.max(
    1,
    ...summary.recordItems.map((item) => item.minutes),
  );
  const hasTimedRecords = summary.timedRecords > 0;

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
            Toggle the factual caregiving records included in both charts. Date
            filters use {data.workspace.timezone}.
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
              Recorded care time
            </p>
            <p className="mt-2 font-heading text-2xl font-semibold">
              {formatMinutes(summary.recordedMinutes)}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Records with duration
            </p>
            <p className="mt-2 font-heading text-2xl font-semibold">
              {summary.timedRecords}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Duration not recorded
            </p>
            <p className="mt-2 font-heading text-2xl font-semibold">
              {summary.untimedRecords}
            </p>
          </CardContent>
        </Card>
      </div>

      {hasTimedRecords ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="flex items-center gap-2">
                  <UsersRound className="size-4 text-primary" /> Time by caregiver
                </h2>
              </CardTitle>
              <CardDescription>
                Recorded duration attributed to each selected caregiver, split by
                record item.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {recordItems.map((item, index) => (
                  <span key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`size-2.5 rounded-sm ${segmentColors[index % segmentColors.length]}`} />
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
                        {formatMinutes(caregiver.totalMinutes)}
                      </span>
                    </div>
                    <div
                      className="flex h-7 overflow-hidden rounded-md bg-muted"
                      role="img"
                      aria-label={`${caregiver.label}: ${formatMinutes(caregiver.totalMinutes)} recorded`}
                    >
                      {caregiver.recordItems.map((item, index) =>
                        item.minutes > 0 ? (
                          <span
                            key={item.label}
                            className={segmentColors[index % segmentColors.length]}
                            style={{
                              width: `${(item.minutes / maxCaregiverMinutes) * 100}%`,
                            }}
                            title={`${item.label}: ${formatMinutes(item.minutes)}`}
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
                  <BarChart3 className="size-4 text-primary" /> Time by record item
                </h2>
              </CardTitle>
              <CardDescription>
                Recorded duration across the selected caregivers and children.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {summary.recordItems.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMinutes(item.minutes)}
                    </span>
                  </div>
                  <div
                    className="h-7 overflow-hidden rounded-md bg-muted"
                    role="img"
                    aria-label={`${item.label}: ${formatMinutes(item.minutes)} recorded`}
                  >
                    <div
                      className="h-full rounded-md bg-primary"
                      style={{
                        width: `${(item.minutes / maxRecordItemMinutes) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <Clock3 className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No recorded duration matches</p>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
              Choose at least one record item, child, and caregiver, or widen the
              date range. Records without a duration remain visible in the summary
              and are never estimated.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="rounded-xl bg-muted/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
        These charts summarize duration entered on completed or partial care
        records. Planned special days are excluded. A record involving multiple
        selected children is counted once; when multiple caregivers share one
        record, its full duration is attributed to each caregiver in the caregiver
        chart.
      </p>
    </div>
  );
}
