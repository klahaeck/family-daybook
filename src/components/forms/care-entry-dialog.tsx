"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, Plus } from "lucide-react";

import { correctCareEntryAction, createCareEntryAction, updateCareEntryAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
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
import { careStatusRecordsProvidedCare } from "@/lib/domain/care-entry-rules";
import { localDateTimeToUtc, toDateTimeLocalInTimezone } from "@/lib/domain/dates";
import type { Caregiver, CareStatus, Child, TodayTask } from "@/lib/domain/types";
import { AttachmentPicker, FieldError, MultiCheck, uploadFiles } from "./form-parts";

export function CareEntryDialog({
  task,
  date,
  today,
  timezone,
  childOptions,
  caregivers,
  finalized = false,
  trigger,
}: {
  task?: TodayTask;
  date: string;
  today: string;
  timezone: string;
  childOptions: Child[];
  caregivers: Caregiver[];
  finalized?: boolean;
  trigger?: React.ReactElement;
}) {
  const queryClient = useQueryClient();
  const editing = Boolean(task?.entry);
  const correcting = editing && finalized;
  const initialStatus = task?.entry?.status ?? "completed";
  const [open, setOpen] = useState(false);
  const [selectedChildren, setSelectedChildren] = useState<string[]>(task?.entry?.childIds ?? task?.childIds ?? childOptions.map((child) => child.id));
  const [selectedCaregivers, setSelectedCaregivers] = useState<string[]>(
    careStatusRecordsProvidedCare(initialStatus)
      ? task?.entry?.caregiverIds ??
          (task
            ? task.plannedCaregiverIds
            : [caregivers.find((item) => item.isOwner)?.id ?? caregivers[0]?.id].filter(Boolean))
      : [],
  );
  const [status, setStatus] = useState<CareStatus>(initialStatus);
  const [files, setFiles] = useState<File[]>([]);
  const [serverError, setServerError] = useState<string>();
  const recordsProvidedCare = careStatusRecordsProvidedCare(status);

  const defaultTime = task?.entry
    ? toDateTimeLocalInTimezone(new Date(task.entry.occurredAt), timezone)
    : date === today
      ? toDateTimeLocalInTimezone(new Date(), timezone)
      : `${date}T${task?.suggestedTime ?? "12:00"}`;

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      setServerError(undefined);
      const details = {
        childIds: selectedChildren,
        caregiverIds: recordsProvidedCare ? selectedCaregivers : [],
        status,
        occurredAt: localDateTimeToUtc(formData.get("occurredAt")!.toString(), timezone),
        durationMinutes: recordsProvidedCare && formData.get("durationMinutes")?.toString()
          ? Number(formData.get("durationMinutes"))
          : undefined,
        activityType: recordsProvidedCare
          ? formData.get("activityType")?.toString() || undefined
          : undefined,
        notes: formData.get("notes")?.toString() || undefined,
      };
      const result = task?.entry
        ? correcting
          ? await correctCareEntryAction({
              recordId: task.entry.id,
              ...details,
              reason: formData.get("reason")?.toString(),
            })
          : await updateCareEntryAction({
            recordId: task.entry.id,
            ...details,
          })
        : await createCareEntryAction({
            localDate: date,
            templateItemId: task?.templateItemId,
            arrangementTaskId: task?.arrangementTaskId,
            taskKey: task?.taskKey ?? "custom",
            taskLabel: task?.label ?? formData.get("taskLabel")?.toString(),
            ...details,
          });
      if (!result.ok || !result.data) throw new Error(result.error ?? "Unable to save record");
      const recordId = task?.entry?.id ?? ("id" in result.data ? result.data.id : undefined);
      if (!recordId) throw new Error("Unable to identify the saved record");
      await uploadFiles(files, "care_entry", recordId);
      return { id: recordId };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard", date] });
      await queryClient.invalidateQueries({ queryKey: ["timeline"] });
      setOpen(false);
      setFiles([]);
    },
    onError: (error) => setServerError(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger} />
      ) : (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="size-4" /> Add record
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <form action={(data) => mutation.mutate(data)}>
          <DialogHeader>
            <DialogTitle>{editing ? `Change ${task?.label}` : task?.label ?? "Add caregiving record"}</DialogTitle>
            <DialogDescription>
              {editing
                ? correcting
                  ? "Save a correction while preserving the prior version and its original entry time."
                  : "Update this record directly while the day is still open."
                : "Record the item’s status and any factual details. The app adds a separate, server-controlled entry time."}
            </DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-5">
            {!task && (
              <div className="space-y-2">
                <Label htmlFor="taskLabel">Activity</Label>
                <Input id="taskLabel" name="taskLabel" required maxLength={100} placeholder="Describe the caregiving activity" />
              </div>
            )}
            <MultiCheck label="Children" values={childOptions} selected={selectedChildren} onChange={setSelectedChildren} />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Status</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  ["completed", "Completed"],
                  ["partial", "Partial"],
                  ["missed", "Missed"],
                  ["not_applicable", "Not applicable"],
                ] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={status === value ? "default" : "outline"}
                    onClick={() => {
                      setStatus(value);
                      if (!careStatusRecordsProvidedCare(value)) {
                        setSelectedCaregivers([]);
                      }
                    }}
                  >
                    {status === value && <Check className="size-3" />}
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>
            {recordsProvidedCare ? (
              <MultiCheck
                label="Who provided the care?"
                values={caregivers.map((caregiver) => ({ ...caregiver, secondary: caregiver.relationship }))}
                selected={selectedCaregivers}
                onChange={setSelectedCaregivers}
              />
            ) : (
              <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                No care provider is assigned because this status records that the care did not occur.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="occurredAt">
                  {status === "missed"
                    ? "When was it expected?"
                    : status === "not_applicable"
                      ? "Routine time"
                      : "When did it occur?"}
                </Label>
                <Input id="occurredAt" name="occurredAt" type="datetime-local" required defaultValue={defaultTime} />
                {status === "not_applicable" && (
                  <p className="text-xs text-muted-foreground">
                    This places the routine item on the selected day; it does not mean care occurred.
                  </p>
                )}
              </div>
              {recordsProvidedCare && (task?.taskKey === "time_together" || !task) && (
                <div className="space-y-2">
                  <Label htmlFor="durationMinutes">Duration in minutes (optional)</Label>
                  <Input id="durationMinutes" name="durationMinutes" type="number" min={1} max={1440} defaultValue={task?.entry?.durationMinutes} placeholder="30" />
                </div>
              )}
            </div>
            {recordsProvidedCare && task?.taskKey === "time_together" && (
              <div className="space-y-2">
                <Label htmlFor="activityType">Activity type</Label>
                <Input id="activityType" name="activityType" maxLength={100} defaultValue={task?.entry?.activityType} placeholder="Reading, homework, playing outside…" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="notes">Factual notes (optional)</Label>
              <Textarea
                id="notes"
                name="notes"
                maxLength={2000}
                rows={4}
                defaultValue={task?.entry?.notes}
                placeholder={
                  recordsProvidedCare
                    ? "Record observable details without conclusions or inferred motives."
                    : "Optionally record the factual reason this item was missed or did not apply."
                }
              />
            </div>
            {correcting && (
              <div className="space-y-2">
                <Label htmlFor={`reason-${task?.entry?.id}`}>Reason for change</Label>
                <Textarea id={`reason-${task?.entry?.id}`} name="reason" rows={2} required minLength={5} maxLength={500} placeholder="Briefly explain what needed to be corrected." />
              </div>
            )}
            <AttachmentPicker files={files} onChange={setFiles} />
            {serverError && <FieldError errors={[serverError]} />}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                selectedChildren.length === 0 ||
                (recordsProvidedCare && selectedCaregivers.length === 0)
              }
            >
              {mutation.isPending ? <Clock3 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {mutation.isPending ? "Saving…" : correcting ? "Save correction" : editing ? "Save changes" : "Save record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
