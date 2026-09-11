"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, MapPin, UserRound } from "lucide-react";

import { AppointmentDialog } from "@/components/forms/appointment-dialog";
import { CorrectionDialog } from "@/components/forms/correction-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/domain/dates";
import { fetchAppointments } from "@/lib/fetchers";
import type { Appointment, Caregiver, Child, Workspace } from "@/lib/domain/types";

export function AppointmentsView({ initialData, childOptions, caregivers, workspace }: { initialData: Appointment[]; childOptions: Child[]; caregivers: Caregiver[]; workspace: Workspace }) {
  const { data } = useQuery({ queryKey: ["appointments"], queryFn: fetchAppointments, initialData });
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><AppointmentDialog childOptions={childOptions} caregivers={caregivers} /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.map((appointment) => (
          <Card key={appointment.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200"><CalendarCheck2 className="size-5" /></span>
                <Badge className="capitalize" variant={appointment.status === "missed" ? "destructive" : "secondary"}>{appointment.status}</Badge>
              </div>
              <h2 className="mt-4 text-lg font-semibold">{appointment.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(appointment.scheduledAt, workspace.timezone)}</p>
              <div className="mt-4 space-y-2 text-sm">
                {appointment.provider && <p className="flex items-center gap-2"><UserRound className="size-4 text-muted-foreground" />{appointment.provider}</p>}
                {appointment.location && <p className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" />{appointment.location}</p>}
              </div>
              {appointment.notes && <p className="mt-4 border-t pt-4 text-sm leading-6">{appointment.notes}</p>}
              {appointment.notes && <div className="mt-2 flex justify-end"><CorrectionDialog recordType="appointment" recordId={appointment.id} currentText={appointment.notes} /></div>}
            </CardContent>
          </Card>
        ))}
        {data.length === 0 && <Card className="col-span-full border-dashed"><CardContent className="p-12 text-center"><CalendarCheck2 className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No appointments yet</p><p className="mt-1 text-sm text-muted-foreground">Track scheduled care and attendance outcomes here.</p></CardContent></Card>}
      </div>
    </div>
  );
}
