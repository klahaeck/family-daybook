"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Clock3, LockKeyhole, Users } from "lucide-react";

import { finalizeDailyLogAction, updateDailyLogNotesAction } from "@/app/actions";
import { CareEntryDialog } from "@/components/forms/care-entry-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { formatDay, formatTime, isValidLocalDate, shiftLocalDate } from "@/lib/domain/dates";
import { fetchDashboard } from "@/lib/fetchers";
import { sortRoutineItemsByTime } from "@/lib/domain/routines";
import type { DailyLog, DashboardData } from "@/lib/domain/types";

function childNames(ids: string[], data: DashboardData) {
  return ids.map((id) => data.children.find((child) => child.id === id)?.displayName).filter(Boolean).join(" + ");
}

function caregiverNames(ids: string[], data: DashboardData) {
  return ids
    .map((id) => data.caregivers.find((caregiver) => caregiver.id === id)?.displayName)
    .filter(Boolean)
    .join(" + ");
}

function DailyLogNotes({ dailyLog }: { dailyLog: DailyLog }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(dailyLog.notes ?? "");
  const finalized = dailyLog.status === "finalized";
  const notesId = `daily-log-notes-${dailyLog.id}`;
  const descriptionId = `${notesId}-description`;
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await updateDailyLogNotesAction({
        localDate: dailyLog.localDate,
        notes,
      });
      if (!result.ok) throw new Error(result.error ?? "Unable to save day notes");
      return result.data?.notes ?? "";
    },
    onSuccess: async (savedNotes) => {
      setNotes(savedNotes);
      await queryClient.invalidateQueries({
        queryKey: ["dashboard", dailyLog.localDate],
      });
    },
  });

  return (
    <Card>
      <CardContent className="p-5">
        <form action={() => mutation.mutate()} className="space-y-3">
          <div>
            <Label htmlFor={notesId}>Day notes (optional)</Label>
            <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
              {finalized
                ? "These notes were locked when the day was finalized."
                : "Add factual context that applies to the day as a whole."}
            </p>
          </div>
          <Textarea
            id={notesId}
            name="notes"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              mutation.reset();
            }}
            maxLength={2000}
            rows={4}
            readOnly={finalized}
            disabled={mutation.isPending}
            aria-describedby={descriptionId}
            aria-invalid={mutation.isError}
            placeholder="Add notes about the day"
            className={finalized ? "bg-muted/30" : undefined}
          />
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
            <div aria-live="polite" className="text-sm">
              {mutation.isError && (
                <p role="alert" className="text-destructive">
                  {mutation.error.message}
                </p>
              )}
              {mutation.isSuccess && !finalized && (
                <p className="text-muted-foreground">Day notes saved.</p>
              )}
            </div>
            {!finalized && (
              <Button
                type="submit"
                size="sm"
                disabled={mutation.isPending || notes === (dailyLog.notes ?? "")}
              >
                {mutation.isPending ? "Saving…" : "Save notes"}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function TodayDashboard({ date, today, initialData }: { date: string; today: string; initialData: DashboardData }) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["dashboard", date], queryFn: () => fetchDashboard(date), initialData });
  const finalize = useMutation({
    mutationFn: () => finalizeDailyLogAction(date),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard", date] }),
  });
  const historical = date < today;
  const navigateToDate = (nextDate: string) => {
    if (!isValidLocalDate(nextDate) || nextDate > today) return;
    startNavigation(() => {
      router.push(nextDate === today ? "/app" : `/app?date=${encodeURIComponent(nextDate)}`, { scroll: false });
    });
  };

  return (
    <div className="min-w-0 max-w-full space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Daily care log</p>
            {historical && <Badge variant="outline">Historical day</Badge>}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{formatDay(date)}</h1>
          <p className="mt-2 text-sm text-muted-foreground">A clear, factual view of {historical ? "care on this day" : "today’s care"} for your children.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/special-days"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <CalendarRange className="size-4" />
            Special days
          </Link>
          <CareEntryDialog date={date} today={today} timezone={data.workspace.timezone} childOptions={data.children} caregivers={data.caregivers} finalized={data.dailyLog.status === "finalized"} />
        </div>
      </div>

      <div className="flex min-w-0 max-w-full flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 max-w-full items-center gap-2" role="group" aria-label="Choose log date">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous day"
            disabled={isNavigating}
            onClick={() => navigateToDate(shiftLocalDate(date, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            aria-label="Log date"
            value={date}
            max={today}
            disabled={isNavigating}
            onChange={(event) => navigateToDate(event.target.value)}
            className="w-full min-w-0 sm:w-44"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next day"
            disabled={isNavigating || date >= today}
            onClick={() => navigateToDate(shiftLocalDate(date, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {historical ? (
          <Button type="button" variant="ghost" size="sm" disabled={isNavigating} onClick={() => navigateToDate(today)}>
            Return to today
          </Button>
        ) : (
          <p className="min-w-0 px-1 text-xs text-muted-foreground">Select an earlier date to add a contemporaneously labeled past entry.</p>
        )}
      </div>

      {historical && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <Clock3 className="mt-0.5 size-4 shrink-0" />
          <p className="text-sm leading-6">
            Records added by the end of the following calendar day are not labeled late. Later records retain separate occurrence and server-controlled entry times.
          </p>
        </div>
      )}

      {data.specialArrangement && (
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarRange className="size-4 text-primary" />
                  <p className="text-sm font-semibold text-primary">
                    Special arrangement
                  </p>
                </div>
                <h2 className="mt-2 text-lg font-semibold">
                  {data.specialArrangement.title}
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.specialArrangement.assignments.map((assignment) => (
                    <Badge key={assignment.childId} variant="secondary">
                      {childNames([assignment.childId], data)} ·{" "}
                      {caregiverNames(assignment.caregiverIds, data)}
                    </Badge>
                  ))}
                </div>
                {data.specialArrangement.note && (
                  <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {data.specialArrangement.note}
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  This is planned context. Saved care records describe what actually
                  occurred.
                </p>
              </div>
              <Link
                href="/app/special-days"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Manage
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="min-w-0 max-w-full overflow-hidden border-0 bg-primary text-primary-foreground shadow-lg shadow-primary/10">
          <CardContent className="p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-primary-foreground/70">
                  {data.specialArrangement
                    ? "Special-day plan progress"
                    : "Routine progress"}
                </p>
                <p className="mt-1 text-4xl font-semibold tracking-tight">{data.completion.percent}%</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3"><CheckCircle2 className="size-6" /></div>
            </div>
            <Progress
              value={data.completion.percent}
              aria-label={
                data.specialArrangement
                  ? "Special-day plan completion"
                  : "Routine completion"
              }
              className="mt-6 bg-white/15 [&_[data-slot=progress-indicator]]:bg-white"
            />
            <p className="mt-3 text-sm text-primary-foreground/75">
              {data.completion.completed} of {data.completion.total}{" "}
              {data.specialArrangement ? "planned tasks" : "routine items"} recorded
            </p>
          </CardContent>
        </Card>
        <Card className="min-w-0 max-w-full">
          <CardContent className="flex h-full flex-col justify-between p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Users className="size-5" /></span>
              <div className="min-w-0">
                <p className="font-medium">{data.children.map((child) => child.displayName).join(" & ")}</p>
                <p className="text-sm text-muted-foreground">{data.caregivers.length} caregivers configured</p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t pt-4 text-sm">
              <span className="text-muted-foreground">Day status</span>
              <Badge variant={data.dailyLog.status === "finalized" ? "default" : "secondary"}>
                {data.dailyLog.status === "finalized" ? "Finalized" : "Open"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="routine-heading" className="min-w-0 max-w-full">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="routine-heading" className="text-xl font-semibold tracking-tight">
              {data.specialArrangement ? "Today’s special-day plan" : "Today’s routine"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap an item to record it, edit it while the day is open, or correct it
              after finalization.
            </p>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sortRoutineItemsByTime(data.tasks).map((task) => {
            const recorded = Boolean(task.entry);
            const trigger = (
              <button type="button" aria-label={`${recorded ? "Change" : "Record"} ${task.label}`} className="group flex w-full min-w-0 max-w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${recorded ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                  {recorded ? <CheckCircle2 className="size-5" /> : <Clock3 className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{task.label}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {recorded && task.entry
                      ? `${childNames(task.entry.childIds, data)} · ${formatTime(task.entry.occurredAt, data.workspace.timezone)}`
                      : `${childNames(task.childIds, data)} · around ${task.suggestedTime}`}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
              </button>
            );
            return (
              <CareEntryDialog key={`${task.id}-${task.entry?.currentRevisionId ?? "new"}`} task={task} date={date} today={today} timezone={data.workspace.timezone} childOptions={data.children} caregivers={data.caregivers} finalized={data.dailyLog.status === "finalized"} trigger={trigger} />
            );
          })}
        </div>
      </section>

      <DailyLogNotes
        key={`${data.dailyLog.id}-${data.dailyLog.status}`}
        dailyLog={data.dailyLog}
      />

      {data.dailyLog.status === "open" && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted"><LockKeyhole className="size-4" /></span>
              <div>
                <p className="font-medium">Ready to close the day?</p>
                <p className="mt-1 text-sm text-muted-foreground">Finalizing locks the routine snapshot. Later additions remain possible and are labeled with their entry time.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => finalize.mutate()} disabled={finalize.isPending}>
              <LockKeyhole className="size-4" /> {finalize.isPending ? "Finalizing…" : "Finalize day"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
