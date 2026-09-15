import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import { CustomCareForm } from "@/components/record-form";
import { ActionButton, Body, Card, ChoiceRow, Field, Heading, InlineNotice, Screen, ScreenState } from "@/components/ui";
import { useApi, useDaybookSession } from "@/providers";
import { colors } from "@/theme";
import { friendlyError, shiftDate, todayLocalDate } from "@/utils";

export default function TodayScreen() {
  const api = useApi();
  const queryClient = useQueryClient();
  const session = useDaybookSession();
  const [date, setDate] = useState(session.data?.currentLocalDate ?? todayLocalDate());
  const [activeTaskId, setActiveTaskId] = useState<string>();
  const [status, setStatus] = useState<"completed" | "partial" | "missed" | "not_applicable">("completed");
  const [localTime, setLocalTime] = useState("12:00");
  const [caregiverIds, setCaregiverIds] = useState<string[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const isReviewer = session.data?.member.role === "reviewer";
  const day = useQuery({ queryKey: ["day", date], queryFn: () => api.getDay(date), enabled: session.data?.billing.status === "active" && !isReviewer });
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings, enabled: Boolean(session.data?.capabilities.mutateRecords) });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["day", date] }); await queryClient.invalidateQueries({ queryKey: ["timeline"] }); };
  const routine = useMutation({ mutationFn: async () => {
    if (!day.data || !activeTaskId) throw new Error("Choose a routine.");
    const task = day.data.tasks.find((item) => item.id === activeTaskId);
    if (!task) throw new Error("That routine is no longer available.");
    const providedCare = status === "completed" || status === "partial";
    return api.recordRoutine(date, {
      routineId: task.templateItemId ?? task.id,
      status,
      childIds: task.childIds,
      caregiverIds: providedCare ? caregiverIds : [],
      localTime: providedCare ? localTime : undefined,
    }, day.data.dayVersion);
  }, onSuccess: async () => { setActiveTaskId(undefined); await refresh(); } });
  const custom = useMutation({ mutationFn: (input: unknown) => api.createCareRecord(input, day.data!.dayVersion), onSuccess: refresh });
  const saveNotes = useMutation({ mutationFn: () => api.updateDayNotes(date, noteDrafts[date] ?? day.data?.notes ?? "", day.data!.dayVersion), onSuccess: refresh });
  const finalize = useMutation({ mutationFn: () => api.finalizeDay(date, day.data!.dayVersion), onSuccess: refresh });
  const canEdit = Boolean(session.data?.capabilities.mutateRecords && day.data?.status === "open");

  if (isReviewer) return <Redirect href="/(app)/timeline" />;

  return (
    <Screen title="Today" subtitle="Record care against the shared daily plan.">
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><ActionButton label="Previous" secondary onPress={() => setDate(shiftDate(date, -1))} /></View>
        <View style={{ flex: 1 }}><ActionButton label={date} secondary onPress={() => setDate(session.data?.currentLocalDate ?? todayLocalDate())} /></View>
        <View style={{ flex: 1 }}><ActionButton label="Next" secondary onPress={() => setDate(shiftDate(date, 1))} /></View>
      </View>
      <ScreenState loading={day.isPending} error={day.error} onRetry={() => void day.refetch()} />
      {day.data ? <>
        {day.data.status === "finalized" ? <InlineNotice>This day is finalized and read-only.</InlineNotice> : null}
        <Card><Heading>Progress</Heading><Body>{day.data.completion.recorded} of {day.data.completion.total} recorded ({day.data.completion.percent}%)</Body></Card>
        {day.data.tasks.map((task) => (
          <Card key={task.id}>
            <Heading>{task.label}</Heading>
            <Body muted>{task.suggestedTime}{task.recorded ? ` · ${day.data.careEntries.find((entry) => entry.id === task.entryId)?.status.replace("_", " ") ?? "recorded"}` : " · not recorded"}</Body>
            {canEdit && !task.recorded ? <ActionButton label="Record" secondary onPress={() => { setActiveTaskId(task.id); setLocalTime(task.suggestedTime); setCaregiverIds(task.plannedCaregiverIds); }} /> : null}
            {activeTaskId === task.id ? <View style={{ gap: 8 }}>
              {(["completed", "partial", "missed", "not_applicable"] as const).map((value) => <ChoiceRow key={value} label={value.replace("_", " ")} selected={status === value} onPress={() => setStatus(value)} />)}
              {(status === "completed" || status === "partial") ? <Field label="Actual local time (HH:mm)" value={localTime} onChangeText={setLocalTime} /> : null}
              {(status === "completed" || status === "partial") ? <><Heading>Caregivers</Heading>{settings.data?.caregivers.filter((item) => item.active).map((caregiver) => <ChoiceRow key={caregiver.id} label={caregiver.displayName} selected={caregiverIds.includes(caregiver.id)} onPress={() => setCaregiverIds((selected) => selected.includes(caregiver.id) ? selected.filter((id) => id !== caregiver.id) : [...selected, caregiver.id])} />)}</> : null}
              {routine.error ? <Text style={{ color: colors.danger }}>{friendlyError(routine.error)}</Text> : null}
              <ActionButton label={routine.isPending ? "Saving…" : "Save routine"} disabled={routine.isPending || ((status === "completed" || status === "partial") && caregiverIds.length === 0)} onPress={() => routine.mutate()} />
              <ActionButton label="Cancel" secondary onPress={() => setActiveTaskId(undefined)} />
            </View> : null}
          </Card>
        ))}
        {canEdit && settings.data ? <Card><CustomCareForm date={date} childOptions={settings.data.children.filter((child) => child.active)} caregivers={settings.data.caregivers.filter((caregiver) => caregiver.active)} pending={custom.isPending} onSubmit={(value) => custom.mutate(value)} />{custom.error ? <Text style={{ color: colors.danger }}>{friendlyError(custom.error)}</Text> : null}</Card> : null}
        <Card>
          <Heading>Daily notes</Heading>
          <Field label="Notes" value={noteDrafts[date] ?? day.data.notes ?? ""} onChangeText={(value) => setNoteDrafts((drafts) => ({ ...drafts, [date]: value }))} multiline />
          {canEdit ? <ActionButton label={saveNotes.isPending ? "Saving…" : "Save notes"} disabled={saveNotes.isPending} onPress={() => saveNotes.mutate()} /> : null}
        </Card>
        {session.data?.capabilities.finalizeDays && day.data.status === "open" ? <ActionButton label="Finalize day" danger onPress={() => Alert.alert("Finalize this day?", "Records become read-only. Corrections remain available.", [{ text: "Cancel", style: "cancel" }, { text: "Finalize", style: "destructive", onPress: () => finalize.mutate() }])} /> : null}
      </> : null}
    </Screen>
  );
}
