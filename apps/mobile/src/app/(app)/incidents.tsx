import type { IncidentInput } from "@family-daybook/contracts";
import { useRecordMutation, useRecordPreview, isRecordSaving } from "@family-daybook/api-client/record-saving";
import { incidentPreview, pendingIdentity } from "@/record-previews";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Text } from "react-native";

import { ActionButton, Body, Card, ChoiceRow, Field, Heading, Screen, ScreenState } from "@/components/ui";
import { useAppTheme } from "@/mobile-theme";
import { useApi, useDaybookSession } from "@/providers";
import { formatDateTime, friendlyError, invalidateRecordQueries } from "@/utils";

export default function IncidentsScreen() {
  const { colors } = useAppTheme();
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useDaybookSession();
  const incidentsQuery = useQuery({ queryKey: ["incidents"], queryFn: api.listIncidents });
  const incidents = { ...incidentsQuery, data: useRecordPreview(["incidents"], incidentsQuery.data) };
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings, enabled: Boolean(session.data?.capabilities.mutateRecords) });
  const [category, setCategory] = useState<"safety_hazard" | "concerning_interaction" | "other">("other");
  const [observations, setObservations] = useState("");
  const [location, setLocation] = useState("");
  const [childIds, setChildIds] = useState<string[]>([]);
  const occurredAt = useRef<string | undefined>(undefined);
  const buildInput = (): IncidentInput => ({ category, occurredAt: (occurredAt.current ??= new Date().toISOString()), location: location || undefined, childIds, peoplePresent: [], witnesses: [], observations });
  const create = useRecordMutation({
    preview: (input: IncidentInput) => incidentPreview({ ...pendingIdentity(), discoveredAt: undefined, location: undefined, exactQuotes: undefined, immediateActions: undefined, outcome: undefined, ...input }),
    savedId: (record) => record.id,
    confirm: (record) => incidentPreview(record),
    mutationFn: (input: IncidentInput) => api.createIncident(input),
    onSuccess: async () => {
    occurredAt.current = undefined;
    setObservations("");
    await invalidateRecordQueries(queryClient, ["incidents"]);
  } });
  return (
    <Screen title="Incidents" subtitle="Record objective observations and immediate actions.">
      {session.data?.capabilities.mutateRecords ? <Card>
        <Heading>Record incident</Heading>
        {(["safety_hazard", "concerning_interaction", "other"] as const).map((value) => <ChoiceRow key={value} label={value.replace("_", " ")} selected={category === value} onPress={() => setCategory(value)} />)}
        <Heading>Children involved</Heading>
        {settings.data?.children.filter((item) => item.active).map((child) => <ChoiceRow key={child.id} label={child.displayName} selected={childIds.includes(child.id)} onPress={() => setChildIds((selected) => selected.includes(child.id) ? selected.filter((id) => id !== child.id) : [...selected, child.id])} />)}
        <ScreenState loading={settings.isPending} error={settings.error} onRetry={() => void settings.refetch()} />
        <Field label="Location (optional)" value={location} onChangeText={setLocation} />
        <Field label="Objective observations" value={observations} onChangeText={setObservations} multiline />
        {create.error ? <Text style={{ color: colors.danger }}>{friendlyError(create.error)}</Text> : null}
        <ActionButton label={create.isPending ? "Saving…" : "Record incident"} disabled={create.isPending || observations.trim().length < 10 || childIds.length === 0} onPress={() => create.mutate(buildInput())} />
      </Card> : null}
      <ScreenState loading={incidents.isPending} error={incidents.error} onRetry={() => void incidents.refetch()} empty={incidents.data?.incidents.length === 0 ? "No incidents recorded." : undefined} />
      {incidents.data?.incidents.map((item) => <Card key={item.id}><Heading>{item.category.replace("_", " ")}</Heading><Body>{formatDateTime(item.occurredAt, session.data?.workspace.timezone ?? "UTC")}</Body><Body>{item.observations}</Body>{item.location ? <Body muted>{item.location}</Body> : null}<ActionButton label={isRecordSaving(item) ? "Saving…" : "View details"} disabled={isRecordSaving(item)} secondary onPress={() => router.push({ pathname: "/records/[recordType]/[id]", params: { recordType: "incident", id: item.id } })} /></Card>)}
    </Screen>
  );
}
