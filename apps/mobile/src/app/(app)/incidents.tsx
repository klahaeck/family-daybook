import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Text } from "react-native";

import { ActionButton, Body, Card, ChoiceRow, Field, Heading, Screen, ScreenState } from "@/components/ui";
import { useApi, useDaybookSession } from "@/providers";
import { colors } from "@/theme";
import { friendlyError } from "@/utils";

export default function IncidentsScreen() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useDaybookSession();
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: api.listIncidents });
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings, enabled: Boolean(session.data?.capabilities.mutateRecords) });
  const [category, setCategory] = useState<"safety_hazard" | "concerning_interaction" | "other">("other");
  const [observations, setObservations] = useState("");
  const [location, setLocation] = useState("");
  const [childIds, setChildIds] = useState<string[]>([]);
  const occurredAt = useRef<string | undefined>(undefined);
  const create = useMutation({ mutationFn: () => {
    if (childIds.length === 0) throw new Error("Choose at least one child.");
    const stableOccurredAt = occurredAt.current ?? new Date().toISOString();
    occurredAt.current = stableOccurredAt;
    return api.createIncident({ category, occurredAt: stableOccurredAt, location: location || undefined, childIds, peoplePresent: [], witnesses: [], observations });
  }, onSuccess: async () => { occurredAt.current = undefined; setObservations(""); await queryClient.invalidateQueries({ queryKey: ["incidents"] }); } });
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
        <ActionButton label={create.isPending ? "Saving…" : "Record incident"} disabled={create.isPending || observations.trim().length < 10 || childIds.length === 0} onPress={() => create.mutate()} />
      </Card> : null}
      <ScreenState loading={incidents.isPending} error={incidents.error} onRetry={() => void incidents.refetch()} empty={incidents.data?.incidents.length === 0 ? "No incidents recorded." : undefined} />
      {incidents.data?.incidents.map((item) => <Card key={item.id}><Heading>{item.category.replace("_", " ")}</Heading><Body>{new Date(item.occurredAt).toLocaleString()}</Body><Body>{item.observations}</Body>{item.location ? <Body muted>{item.location}</Body> : null}<ActionButton label="View details" secondary onPress={() => router.push({ pathname: "/records/[recordType]/[id]", params: { recordType: "incident", id: item.id } })} /></Card>)}
    </Screen>
  );
}
