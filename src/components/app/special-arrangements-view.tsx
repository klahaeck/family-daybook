"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  Check,
  Clock3,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

import {
  correctSpecialArrangementAction,
  createSpecialArrangementAction,
  updateSpecialArrangementAction,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDay,
  localDateInTimezone,
  shiftLocalDate,
} from "@/lib/domain/dates";
import { createArrangementTasksForDate } from "@/lib/domain/arrangements";
import type {
  CareTaskKey,
  SpecialArrangementAssignment,
  SpecialArrangementDay,
  SpecialArrangementsData,
} from "@/lib/domain/types";
import { fetchSpecialArrangements } from "@/lib/fetchers";

type TaskDraft = {
  clientKey: string;
  id?: string;
  sourceRoutineItemId?: string;
  taskKey: CareTaskKey;
  childId: string;
  label: string;
  suggestedTime: string;
};

type DayDraft = {
  localDate: string;
  tasks: TaskDraft[];
};

function datesInRange(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const dates: string[] = [];
  for (
    let date = startDate;
    date <= endDate && dates.length < 31;
    date = shiftLocalDate(date, 1)
  ) {
    dates.push(date);
  }
  return dates;
}

function routineTasksForDate(
  date: string,
  data: SpecialArrangementsData,
): TaskDraft[] {
  return createArrangementTasksForDate(date, data.template, data.children).map(
    (task) => ({
      ...task,
      clientKey: `${date}:${task.sourceRoutineItemId}:${task.childId}`,
    }),
  );
}

function reconcileDays(
  startDate: string,
  endDate: string,
  current: DayDraft[],
  data: SpecialArrangementsData,
): DayDraft[] {
  const currentByDate = new Map(current.map((day) => [day.localDate, day]));
  return datesInRange(startDate, endDate).map(
    (localDate) =>
      currentByDate.get(localDate) ?? {
        localDate,
        tasks: routineTasksForDate(localDate, data),
      },
  );
}

function assignmentsForChildren(
  children: SpecialArrangementsData["children"],
): SpecialArrangementAssignment[] {
  return children.map((child) => ({ childId: child.id, caregiverIds: [] }));
}

function assignmentComplete(assignments: SpecialArrangementAssignment[]) {
  return assignments.every((assignment) => assignment.caregiverIds.length > 0);
}

function TaskPlanEditor({
  date,
  tasks,
  data,
  onChange,
}: {
  date: string;
  tasks: TaskDraft[];
  data: SpecialArrangementsData;
  onChange: (tasks: TaskDraft[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{formatDay(date)}</p>
          <p className="text-xs text-muted-foreground">
            These tasks are planned context and do not create care records.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...tasks,
              {
                clientKey: `custom:${crypto.randomUUID()}`,
                taskKey: "custom",
                childId: data.children[0]?.id ?? "",
                label: "",
                suggestedTime: "12:00",
              },
            ])
          }
        >
          <Plus className="size-4" />
          Add task
        </Button>
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border p-2">
        {tasks.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No routine tasks are planned for this date.
          </p>
        )}
        {tasks.map((task, index) => (
          <div
            key={task.clientKey}
            className="grid gap-2 rounded-lg bg-muted/45 p-3 sm:grid-cols-[9rem_minmax(0,1fr)_7rem_auto]"
          >
            <div className="space-y-1">
              <Label htmlFor={`task-child-${task.clientKey}`}>Child</Label>
              <select
                id={`task-child-${task.clientKey}`}
                className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                value={task.childId}
                onChange={(event) =>
                  onChange(
                    tasks.map((value, taskIndex) =>
                      taskIndex === index
                        ? { ...value, childId: event.target.value }
                        : value,
                    ),
                  )
                }
              >
                {data.children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`task-label-${task.clientKey}`}>Task</Label>
              <Input
                id={`task-label-${task.clientKey}`}
                value={task.label}
                maxLength={100}
                required
                onChange={(event) =>
                  onChange(
                    tasks.map((value, taskIndex) =>
                      taskIndex === index
                        ? { ...value, label: event.target.value }
                        : value,
                    ),
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`task-time-${task.clientKey}`}>Time</Label>
              <Input
                id={`task-time-${task.clientKey}`}
                type="time"
                value={task.suggestedTime}
                required
                onChange={(event) =>
                  onChange(
                    tasks.map((value, taskIndex) =>
                      taskIndex === index
                        ? { ...value, suggestedTime: event.target.value }
                        : value,
                    ),
                  )
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="self-end text-destructive hover:text-destructive"
              aria-label={`Remove ${task.label || "planned task"}`}
              onClick={() =>
                onChange(tasks.filter((value) => value.clientKey !== task.clientKey))
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssignmentEditor({
  assignments,
  data,
  onChange,
}: {
  assignments: SpecialArrangementAssignment[];
  data: SpecialArrangementsData;
  onChange: (assignments: SpecialArrangementAssignment[]) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-xl border p-4">
      <legend className="px-1 text-sm font-medium">
        Planned responsibility
      </legend>
      {data.children.map((child) => {
        const assignment = assignments.find(
          (value) => value.childId === child.id,
        ) ?? { childId: child.id, caregiverIds: [] };
        return (
          <div key={child.id} className="rounded-lg bg-muted/45 p-3">
            <p className="text-sm font-medium">{child.displayName}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {data.caregivers.map((caregiver) => {
                const selected = assignment.caregiverIds.includes(caregiver.id);
                return (
                  <label
                    key={caregiver.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) =>
                        onChange(
                          assignments.map((value) =>
                            value.childId === child.id
                              ? {
                                  ...value,
                                  caregiverIds: checked
                                    ? [...value.caregiverIds, caregiver.id]
                                    : value.caregiverIds.filter(
                                        (id) => id !== caregiver.id,
                                      ),
                                }
                              : value,
                          ),
                        )
                      }
                    />
                    {caregiver.displayName}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}

function NewArrangementDialog({ data }: { data: SpecialArrangementsData }) {
  const today = localDateInTimezone(new Date(), data.workspace.timezone);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [assignments, setAssignments] = useState(() =>
    assignmentsForChildren(data.children),
  );
  const [days, setDays] = useState<DayDraft[]>(() =>
    reconcileDays(today, today, [], data),
  );
  const [selectedDate, setSelectedDate] = useState(today);
  const [error, setError] = useState<string>();
  const mutation = useMutation({
    mutationFn: async () => {
      setError(undefined);
      const result = await createSpecialArrangementAction({
        title,
        note: note || undefined,
        startDate,
        endDate,
        assignments,
        days: days.map((day) => ({
          localDate: day.localDate,
          tasks: day.tasks.map((task) => ({
            sourceRoutineItemId: task.sourceRoutineItemId,
            taskKey: task.taskKey,
            childId: task.childId,
            label: task.label,
            suggestedTime: task.suggestedTime,
          })),
        })),
      });
      if (!result.ok) throw new Error(result.error ?? "Unable to save arrangement");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["special-arrangements"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      setTitle("");
      setNote("");
      setStartDate(today);
      setEndDate(today);
      setAssignments(assignmentsForChildren(data.children));
      setDays(reconcileDays(today, today, [], data));
      setSelectedDate(today);
    },
    onError: (cause) => setError(cause.message),
  });
  const updateRange = (nextStart: string, nextEnd: string) => {
    if (!nextStart) {
      setStartDate("");
      setEndDate("");
      setDays([]);
      setSelectedDate("");
      return;
    }
    const effectiveEnd = nextEnd || nextStart;
    const boundedEnd =
      effectiveEnd < nextStart
        ? nextStart
        : effectiveEnd > shiftLocalDate(nextStart, 30)
          ? shiftLocalDate(nextStart, 30)
          : effectiveEnd;
    setStartDate(nextStart);
    setEndDate(boundedEnd);
    const nextDays = reconcileDays(nextStart, boundedEnd, days, data);
    setDays(nextDays);
    if (!nextDays.some((day) => day.localDate === selectedDate)) {
      setSelectedDate(nextDays[0]?.localDate ?? nextStart);
    }
  };
  const selectedDay = days.find((day) => day.localDate === selectedDate);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <CalendarRange className="size-4" />
        New arrangement
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Plan special days</DialogTitle>
            <DialogDescription>
              Save planned responsibility and a separate task list for each date.
              Care records will still describe what actually occurred.
            </DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="arrangement-title">Arrangement name</Label>
              <Input
                id="arrangement-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Camping weekend"
                minLength={2}
                maxLength={120}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="arrangement-start">Starts</Label>
                <Input
                  id="arrangement-start"
                  type="date"
                  value={startDate}
                  onChange={(event) => updateRange(event.target.value, endDate)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="arrangement-end">Through</Label>
                <Input
                  id="arrangement-end"
                  type="date"
                  min={startDate || undefined}
                  max={startDate ? shiftLocalDate(startDate, 30) : undefined}
                  value={endDate}
                  onChange={(event) => updateRange(startDate, event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="arrangement-note">Factual note (optional)</Label>
              <Textarea
                id="arrangement-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Brief context for the planned change."
              />
            </div>
            <AssignmentEditor
              assignments={assignments}
              data={data}
              onChange={setAssignments}
            />
            <div className="space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {days.map((day) => (
                  <Button
                    key={day.localDate}
                    type="button"
                    size="sm"
                    variant={selectedDate === day.localDate ? "default" : "outline"}
                    onClick={() => setSelectedDate(day.localDate)}
                  >
                    {day.localDate.slice(5)}
                  </Button>
                ))}
              </div>
              {selectedDay && (
                <TaskPlanEditor
                  date={selectedDay.localDate}
                  tasks={selectedDay.tasks}
                  data={data}
                  onChange={(tasks) =>
                    setDays((current) =>
                      current.map((day) =>
                        day.localDate === selectedDay.localDate
                          ? { ...day, tasks }
                          : day,
                      ),
                    )
                  }
                />
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                !assignmentComplete(assignments) ||
                title.trim().length < 2
              }
            >
              {mutation.isPending ? (
                <Clock3 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {mutation.isPending ? "Saving…" : "Save arrangement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditArrangementDialog({
  day,
  data,
}: {
  day: SpecialArrangementDay;
  data: SpecialArrangementsData;
}) {
  const queryClient = useQueryClient();
  const finalized = day.dailyLogStatus === "finalized";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(day.title);
  const [note, setNote] = useState(day.note ?? "");
  const [status, setStatus] = useState(day.status);
  const [assignments, setAssignments] = useState(day.assignments);
  const [tasks, setTasks] = useState<TaskDraft[]>(() =>
    day.tasks.map((task) => ({
      ...task,
      clientKey: task.id,
    })),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const mutation = useMutation({
    mutationFn: async () => {
      setError(undefined);
      const payload = {
        recordId: day.id,
        title,
        note: note || undefined,
        status,
        assignments,
        tasks: tasks.map((task) => ({
          id: task.id,
          sourceRoutineItemId: task.sourceRoutineItemId,
          taskKey: task.taskKey,
          childId: task.childId,
          label: task.label,
          suggestedTime: task.suggestedTime,
        })),
      };
      const result = finalized
        ? await correctSpecialArrangementAction({ ...payload, reason })
        : await updateSpecialArrangementAction(payload);
      if (!result.ok) throw new Error(result.error ?? "Unable to save arrangement");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["special-arrangements"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", day.localDate] });
      setOpen(false);
    },
    onError: (cause) => setError(cause.message),
  });
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setTitle(day.title);
      setNote(day.note ?? "");
      setStatus(day.status);
      setAssignments(day.assignments);
      setTasks(
        day.tasks.map((task) => ({
          ...task,
          clientKey: task.id,
        })),
      );
      setReason("");
      setError(undefined);
    }
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="size-4" />
        {finalized ? "Correct" : "Edit"}
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {finalized ? "Correct" : "Edit"} {formatDay(day.localDate)}
            </DialogTitle>
            <DialogDescription>
              {finalized
                ? "This day is finalized. Saving creates a new revision and preserves the prior arrangement."
                : "Changes remain direct edits until the daily log is finalized."}
            </DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-5">
            <div className="space-y-2">
              <Label htmlFor={`edit-title-${day.id}`}>Arrangement name</Label>
              <Input
                id={`edit-title-${day.id}`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-note-${day.id}`}>Factual note (optional)</Label>
              <Textarea
                id={`edit-note-${day.id}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>
            <AssignmentEditor
              assignments={assignments}
              data={data}
              onChange={setAssignments}
            />
            <TaskPlanEditor
              date={day.localDate}
              tasks={tasks}
              data={data}
              onChange={setTasks}
            />
            <label className="flex items-center gap-3 rounded-xl border p-4 text-sm">
              <Checkbox
                checked={status === "active"}
                onCheckedChange={(checked) =>
                  setStatus(checked ? "active" : "cancelled")
                }
              />
              <span>
                <span className="block font-medium">Arrangement is active</span>
                <span className="text-xs text-muted-foreground">
                  Cancelled arrangements remain auditable but no longer replace the
                  routine.
                </span>
              </span>
            </label>
            {finalized && (
              <div className="space-y-2">
                <Label htmlFor={`edit-reason-${day.id}`}>
                  Reason for correction
                </Label>
                <Textarea
                  id={`edit-reason-${day.id}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={5}
                  maxLength={500}
                  rows={2}
                  required
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                !assignmentComplete(assignments) ||
                (finalized && reason.trim().length < 5)
              }
            >
              {mutation.isPending ? (
                <Clock3 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {mutation.isPending
                ? "Saving…"
                : finalized
                  ? "Save correction"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function assignmentSummary(
  day: SpecialArrangementDay,
  data: SpecialArrangementsData,
) {
  return day.assignments
    .map((assignment) => {
      const child = data.children.find((value) => value.id === assignment.childId);
      const caregivers = assignment.caregiverIds
        .map(
          (caregiverId) =>
            data.caregivers.find((value) => value.id === caregiverId)?.displayName,
        )
        .filter(Boolean)
        .join(" + ");
      return `${child?.displayName ?? "Unknown child"}: ${caregivers}`;
    })
    .join(" · ");
}

export function SpecialArrangementsView({
  initialData,
}: {
  initialData: SpecialArrangementsData;
}) {
  const { data } = useQuery({
    queryKey: ["special-arrangements"],
    queryFn: fetchSpecialArrangements,
    initialData,
  });

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <NewArrangementDialog data={data} />
      </div>
      <div className="space-y-3">
        {data.days.map((day) => (
          <Card key={day.id} className={day.status === "cancelled" ? "opacity-70" : ""}>
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                  <CalendarRange className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{day.title}</h2>
                    <Badge variant={day.status === "active" ? "default" : "secondary"}>
                      {day.status === "active" ? "Active" : "Cancelled"}
                    </Badge>
                    <Badge variant="outline">
                      {day.dailyLogStatus === "finalized" ? "Finalized" : "Open"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm font-medium">{formatDay(day.localDate)}</p>
                  <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
                    <Users className="mt-0.5 size-4 shrink-0" />
                    <span>{assignmentSummary(day, data)}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {day.tasks.length} planned {day.tasks.length === 1 ? "task" : "tasks"}
                  </p>
                  {day.note && (
                    <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6">
                      {day.note}
                    </p>
                  )}
                </div>
              </div>
              <EditArrangementDialog day={day} data={data} />
            </CardContent>
          </Card>
        ))}
        {data.days.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <CalendarRange className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No special arrangements yet</p>
              <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
                Plan a trip, holiday, or other date range without changing the
                family’s repeating routine.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
