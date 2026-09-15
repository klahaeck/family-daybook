import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { ActionButton, Body, Card, ChoiceRow, Heading, Screen, ScreenState } from "@/components/ui";
import { useApi } from "@/providers";

export default function TimelineScreen() {
  const api = useApi();
  const router = useRouter();
  const [kind, setKind] = useState<string>();
  const [cursor, setCursor] = useState<string>();
  const timeline = useQuery({ queryKey: ["timeline", kind, cursor], queryFn: () => api.getTimeline({ kind, cursor }) });
  return (
    <Screen title="Timeline" subtitle="A chronological, read-only view of family records.">
      <Card>
        <Heading>Filter</Heading>
        {[undefined, "care", "appointment", "incident", "special_day"].map((value) => <ChoiceRow key={value ?? "all"} label={value?.replace("_", " ") ?? "All records"} selected={kind === value} onPress={() => { setKind(value); setCursor(undefined); }} />)}
      </Card>
      <ScreenState loading={timeline.isPending} error={timeline.error} onRetry={() => void timeline.refetch()} empty={timeline.data?.items.length === 0 ? "No records match this filter." : undefined} />
      {timeline.data?.summary ? <Card><Heading>Care summary</Heading><Body>Completed {timeline.data.summary.completed} · Partial {timeline.data.summary.partial} · Missed {timeline.data.summary.missed}</Body></Card> : null}
      {timeline.data?.items.map((item) => <Card key={`${item.kind}-${item.id}`}><Heading>{item.title}</Heading><Body>{new Date(item.occurredAt).toLocaleString()}</Body><Body muted>{item.kind.replace("_", " ")} · {item.status.replace("_", " ")}</Body>{item.description ? <Body>{item.description}</Body> : null}{item.kind !== "special_day" ? <ActionButton label="View details" secondary onPress={() => router.push({ pathname: "/records/[recordType]/[id]", params: { recordType: item.kind === "care" ? "care_entry" : item.kind, id: item.id, ...(item.localDate ? { localDate: item.localDate } : {}) } })} /> : null}</Card>)}
      {timeline.data?.nextCursor ? <View><ActionButton label="Next page" secondary onPress={() => setCursor(timeline.data?.nextCursor ?? undefined)} /></View> : null}
      {cursor ? <View><ActionButton label="Back to newest" secondary onPress={() => setCursor(undefined)} /></View> : null}
    </Screen>
  );
}
