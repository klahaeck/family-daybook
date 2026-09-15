import type { Appointment } from "@family-daybook/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { ActionButton, Body, Card, ChoiceRow, Field, Heading, Screen, ScreenState } from "@/components/ui";
import { useApi, useDaybookSession } from "@/providers";
import { colors } from "@/theme";
import { friendlyError } from "@/utils";

const defaultScheduledAt = new Date(Date.now() + 86_400_000).toISOString();
const appointmentStatuses: Appointment["status"][] = ["scheduled", "attended", "late", "missed", "cancelled", "rescheduled"];

export default function AppointmentsScreen() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useDaybookSession();
  const appointments = useQuery({ queryKey: ["appointments"], queryFn: api.listAppointments });
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings, enabled: Boolean(session.data?.capabilities.mutateRecords) });
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [location, setLocation] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt);
  const [status, setStatus] = useState<Appointment["status"]>("scheduled");
  const [arrivedAt, setArrivedAt] = useState("");
  const [cancellationDetails, setCancellationDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [childIds, setChildIds] = useState<string[]>([]);
  const [caregiverIds, setCaregiverIds] = useState<string[]>([]);
  const create = useMutation({ mutationFn: () => {
    if (childIds.length === 0 || caregiverIds.length === 0) throw new Error("Choose at least one child and responsible caregiver.");
    return api.createAppointment({
      title,
      provider: provider.trim() || undefined,
      location: location.trim() || undefined,
      childIds,
      responsibleCaregiverIds: caregiverIds,
      scheduledAt,
      status,
      arrivedAt: (status === "attended" || status === "late") && arrivedAt.trim() ? arrivedAt.trim() : undefined,
      cancellationDetails: (status === "cancelled" || status === "rescheduled") && cancellationDetails.trim() ? cancellationDetails.trim() : undefined,
      notes: notes.trim() || undefined,
    });
  }, onSuccess: async () => {
    setTitle("");
    setProvider("");
    setLocation("");
    setStatus("scheduled");
    setArrivedAt("");
    setCancellationDetails("");
    setNotes("");
    await queryClient.invalidateQueries({ queryKey: ["appointments"] });
  } });
  return (
    <Screen title="Appointments" subtitle="Track scheduled care and attendance.">
      {session.data?.capabilities.mutateRecords ? <Card>
        <Heading>Add appointment</Heading>
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Provider (optional)" value={provider} onChangeText={setProvider} />
        <Field label="Location (optional)" value={location} onChangeText={setLocation} />
        <Field label="Scheduled date and time (ISO 8601)" value={scheduledAt} onChangeText={setScheduledAt} autoCapitalize="none" />
        <Heading>Status</Heading>
        {appointmentStatuses.map((value) => <ChoiceRow key={value} label={value} selected={status === value} onPress={() => setStatus(value)} />)}
        {status === "attended" || status === "late" ? <Field label="Arrival date and time (ISO 8601, optional)" value={arrivedAt} onChangeText={setArrivedAt} autoCapitalize="none" /> : null}
        {status === "cancelled" || status === "rescheduled" ? <Field label="Cancellation or rescheduling details (optional)" value={cancellationDetails} onChangeText={setCancellationDetails} multiline /> : null}
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
        <Heading>Children</Heading>
        {settings.data?.children.filter((item) => item.active).map((child) => <ChoiceRow key={child.id} label={child.displayName} selected={childIds.includes(child.id)} onPress={() => setChildIds((selected) => selected.includes(child.id) ? selected.filter((id) => id !== child.id) : [...selected, child.id])} />)}
        <Heading>Responsible caregivers</Heading>
        {settings.data?.caregivers.filter((item) => item.active).map((caregiver) => <ChoiceRow key={caregiver.id} label={caregiver.displayName} selected={caregiverIds.includes(caregiver.id)} onPress={() => setCaregiverIds((selected) => selected.includes(caregiver.id) ? selected.filter((id) => id !== caregiver.id) : [...selected, caregiver.id])} />)}
        <ScreenState loading={settings.isPending} error={settings.error} onRetry={() => void settings.refetch()} />
        {create.error ? <Text style={{ color: colors.danger }}>{friendlyError(create.error)}</Text> : null}
        <ActionButton label={create.isPending ? "Saving…" : "Add appointment"} disabled={create.isPending || title.trim().length < 2 || childIds.length === 0 || caregiverIds.length === 0} onPress={() => create.mutate()} />
      </Card> : null}
      <ScreenState loading={appointments.isPending} error={appointments.error} onRetry={() => void appointments.refetch()} empty={appointments.data?.length === 0 ? "No appointments yet." : undefined} />
      {appointments.data?.map((item) => <Card key={item.id}><Heading>{item.title}</Heading><Body>{new Date(item.scheduledAt).toLocaleString()}</Body><Body muted>{item.status}{item.provider ? ` · ${item.provider}` : ""}</Body>{item.location ? <Body>{item.location}</Body> : null}{item.arrivedAt ? <Body>Arrived {new Date(item.arrivedAt).toLocaleString()}</Body> : null}{item.cancellationDetails ? <Body>Cancellation/rescheduling: {item.cancellationDetails}</Body> : null}<ActionButton label="View details" secondary onPress={() => router.push({ pathname: "/records/[recordType]/[id]", params: { recordType: "appointment", id: item.id } })} /></Card>)}
    </Screen>
  );
}
