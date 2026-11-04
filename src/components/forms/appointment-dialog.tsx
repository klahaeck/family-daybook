"use client";

import { useState } from "react";
import { CalendarPlus, Check, Clock3 } from "lucide-react";

import { createAppointmentAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toDateTimeLocal } from "@/lib/domain/dates";
import type { Caregiver, Child } from "@/lib/domain/types";
import { appointmentSchema, type AppointmentInput } from "@/lib/domain/schemas";
import { appointmentPreview, pendingIdentity } from "@/lib/record-previews";
import { useRecordSave } from "./use-record-save";
import { AttachmentPicker, FieldError, MultiCheck } from "./form-parts";

export function AppointmentDialog({ childOptions, caregivers }: { childOptions: Child[]; caregivers: Caregiver[] }) {
  const [open, setOpen] = useState(false);
  const [childIds, setChildIds] = useState<string[]>([childOptions[0]?.id].filter(Boolean));
  const [caregiverIds, setCaregiverIds] = useState<string[]>([caregivers.find((item) => item.isOwner)?.id ?? caregivers[0]?.id].filter(Boolean));
  const [status, setStatus] = useState("scheduled");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const mutation = useRecordSave({
    recordType: "appointment", queryKeys: [["appointments"], ["timeline"]], files, setFiles, setOpen,
    preview: (input: AppointmentInput) => appointmentPreview({ ...pendingIdentity(), ...input }),
    save: async (input: AppointmentInput) => {
      const result = await createAppointmentAction(input);
      if (!result.ok || !result.data) throw new Error(result.error ?? "Unable to save appointment");
      return { id: result.data.id, confirmed: result.data.record ? appointmentPreview(result.data.record) : [] };
    },
  });
  const submit = (formData: FormData) => {
    setError(undefined);
    try {
      mutation.mutate(appointmentSchema.parse({
        childIds,
        title: formData.get("title")?.toString(),
        provider: formData.get("provider")?.toString() || undefined,
        location: formData.get("location")?.toString() || undefined,
        scheduledAt: new Date(formData.get("scheduledAt")!.toString()).toISOString(),
        responsibleCaregiverIds: caregiverIds,
        status,
        arrivedAt: formData.get("arrivedAt")?.toString()
          ? new Date(formData.get("arrivedAt")!.toString()).toISOString()
          : undefined,
        cancellationDetails: formData.get("cancellationDetails")?.toString() || undefined,
        notes: formData.get("notes")?.toString() || undefined,
      }));
    } catch { setError("Check the appointment details and try again."); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) setOpen(next); }}>
      <DialogTrigger render={<Button disabled={mutation.isPending} />}><CalendarPlus className="size-4" /> Add appointment</DialogTrigger>
      <DialogContent keepMounted={mutation.preserveDraft} className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={(event) => { event.preventDefault(); if (!mutation.isPending) submit(new FormData(event.currentTarget)); }}>
          <DialogHeader>
            <DialogTitle>Track an appointment</DialogTitle>
            <DialogDescription>Record the scheduled details and the factual attendance outcome.</DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-5">
            <div className="space-y-2"><Label htmlFor="title">Appointment</Label><Input id="title" name="title" required maxLength={160} placeholder="Pediatrician follow-up" /></div>
            <MultiCheck label="Children" values={childOptions} selected={childIds} onChange={setChildIds} />
            <MultiCheck label="Responsible caregiver" values={caregivers.map((item) => ({ ...item, secondary: item.relationship }))} selected={caregiverIds} onChange={setCaregiverIds} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="scheduledAt">Scheduled time</Label><Input id="scheduledAt" name="scheduledAt" type="datetime-local" defaultValue={toDateTimeLocal()} required /></div>
              <div className="space-y-2"><Label htmlFor="arrivedAt">Arrival time (optional)</Label><Input id="arrivedAt" name="arrivedAt" type="datetime-local" /></div>
              <div className="space-y-2"><Label htmlFor="provider">Provider (optional)</Label><Input id="provider" name="provider" maxLength={160} /></div>
              <div className="space-y-2"><Label htmlFor="location">Location (optional)</Label><Input id="location" name="location" maxLength={200} /></div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Attendance outcome</legend>
              <div className="flex flex-wrap gap-2">
                {["scheduled", "attended", "late", "missed", "cancelled", "rescheduled"].map((value) => (
                  <Button key={value} type="button" size="sm" variant={status === value ? "default" : "outline"} onClick={() => setStatus(value)} className="capitalize">
                    {status === value && <Check className="size-3" />}{value}
                  </Button>
                ))}
              </div>
            </fieldset>
            {(status === "cancelled" || status === "rescheduled") && (
              <div className="space-y-2"><Label htmlFor="cancellationDetails">Cancellation or rescheduling details</Label><Textarea id="cancellationDetails" name="cancellationDetails" rows={3} maxLength={1000} /></div>
            )}
            <div className="space-y-2"><Label htmlFor="notes">Factual notes (optional)</Label><Textarea id="notes" name="notes" rows={4} maxLength={2000} placeholder="Record notification source, time, and observable details." /></div>
            <AttachmentPicker files={files} onChange={setFiles} />
            {(error || mutation.errorMessage) && <FieldError errors={[error ?? mutation.errorMessage!]} />}
          </div>
          <DialogFooter><Button type="submit" disabled={mutation.isPending || childIds.length === 0 || caregiverIds.length === 0}>{mutation.isPending ? <Clock3 className="size-4 animate-spin" /> : <Check className="size-4" />}{mutation.isPending ? "Saving…" : mutation.retryingFiles ? "Retry supporting files" : "Save appointment"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
